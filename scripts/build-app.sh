#!/bin/bash
# Builds the macOS app and installs it.
# Self-contained: no network, no local server, no runtime dependencies.
#
#   ./scripts/build-app.sh [dest]          # default dest: /Applications
#
# Override the identity if you are packaging your own fork:
#   APP_NAME="Parity" BUNDLE_ID="com.example.parity" ./scripts/build-app.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-/Applications}"

APP_NAME="${APP_NAME:-Paritymac}"
# Keying on the original id keeps existing settings and run history readable.
BUNDLE_ID="${BUNDLE_ID:-com.samvrith.pcpzetamac}"
EXEC_NAME="${EXEC_NAME:-Paritymac}"
VERSION="${VERSION:-1.1.0}"
ICON_INK="${ICON_INK:-EDEDED}"
ICON_PLATE="${ICON_PLATE:-141414}"

TARGET="$DEST/$APP_NAME.app"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
APP="$STAGE/$APP_NAME.app"

echo "==> compiling"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"
swiftc -O -target "$(uname -m)-apple-macos12.0" \
       -o "$APP/Contents/MacOS/$EXEC_NAME" "$ROOT/src/mac/main.swift"

echo "==> bundling web assets"
WEB="$APP/Contents/Resources/web"
cp "$ROOT/src/index.html" "$ROOT/src/base.css" \
   "$ROOT/src/engine.js" "$ROOT/src/history.js" \
   "$ROOT/src/skins.js" "$ROOT/src/levels.js" "$WEB/"
cp -R "$ROOT/src/skins" "$WEB/skins"
# Only the woff2 faces are loaded by the page. GeistPixel.ttf is build-time
# only (make-icon.swift reads it from the repo), so shipping it would add
# ~800KB to the bundle for nothing. OFL.txt travels with the fonts because
# the licence requires it.
mkdir -p "$WEB/fonts"
cp "$ROOT/src/fonts/"*.woff2 "$ROOT/src/fonts/OFL.txt" "$WEB/fonts/"

echo "==> rendering icon"
swift "$ROOT/scripts/make-icon.swift" "$STAGE/AppIcon.iconset" \
      "$ROOT/src/fonts/GeistPixel.ttf" "$ICON_INK" "$ICON_PLATE" >/dev/null
iconutil -c icns "$STAGE/AppIcon.iconset" -o "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleExecutable</key><string>$EXEC_NAME</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.education</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSSupportsAutomaticGraphicsSwitching</key><true/>
</dict>
</plist>
PLIST

echo "==> signing"
# Ad-hoc by default: arm64 refuses to launch an unsigned bundle at all.
# Set SIGN_ID to a "Developer ID Application: ..." identity to produce a build
# that can be notarised. The hardened runtime is required for notarisation.
SIGN_ID="${SIGN_ID:--}"
if [ "$SIGN_ID" = "-" ]; then
  codesign --force --sign - --timestamp=none "$APP" 2>/dev/null
else
  codesign --force --sign "$SIGN_ID" --options runtime --timestamp "$APP"
fi

echo "==> installing to $DEST"
if [ -e "$TARGET" ]; then
  EXISTING="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' \
              "$TARGET/Contents/Info.plist" 2>/dev/null || echo '')"
  if [ "$EXISTING" != "$BUNDLE_ID" ]; then
    echo "Refusing to replace $TARGET: not this app (id '$EXISTING')." >&2
    exit 1
  fi
  rm -rf "$TARGET"
fi
mkdir -p "$DEST"
cp -R "$APP" "$TARGET"
echo "==> installed: $TARGET"
