#!/bin/bash
# Builds a parity drill app and installs it to /Applications.
# Self-contained: no network, no local server, no runtime dependencies.
#
#   ./scripts/build-app.sh [paritymac|paritycade|all] [dest]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VARIANT="${1:-paritymac}"
DEST="${2:-/Applications}"
VERSION="1.0.0"

build_one() {
  local variant="$1"
  local APP_NAME BUNDLE_ID EXEC_NAME WEB_SRC ICON_INK ICON_PLATE

  case "$variant" in
    paritymac)
      APP_NAME="Paritymac"
      # Unchanged from the pre-rename build: it keys the saved settings.
      BUNDLE_ID="com.samvrith.pcpzetamac"
      EXEC_NAME="Paritymac"
      WEB_SRC="$ROOT/src"
      ICON_INK="EDEDED"; ICON_PLATE="141414"
      ;;
    paritycade)
      APP_NAME="Paritycade"
      # Separate id, so the two apps keep separate settings and window frames.
      BUNDLE_ID="com.samvrith.paritycade"
      EXEC_NAME="Paritycade"
      WEB_SRC="$ROOT/src/arcade"
      ICON_INK="F5A623"; ICON_PLATE="0E0E12"
      ;;
    *) echo "unknown variant: $variant" >&2; return 1 ;;
  esac

  local TARGET="$DEST/$APP_NAME.app"
  local STAGE APP
  STAGE="$(mktemp -d)"
  APP="$STAGE/$APP_NAME.app"

  echo "==> [$APP_NAME] compiling"
  mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"
  swiftc -O -target "$(uname -m)-apple-macos12.0" \
         -o "$APP/Contents/MacOS/$EXEC_NAME" "$ROOT/src/mac/main.swift"

  echo "==> [$APP_NAME] bundling web assets"
  cp "$WEB_SRC/index.html" "$WEB_SRC/styles.css" "$WEB_SRC/app.js" \
     "$APP/Contents/Resources/web/"
  # levels.js and the faces are shared by every variant.
  cp "$ROOT/src/levels.js" "$APP/Contents/Resources/web/"
  cp -R "$ROOT/src/fonts" "$APP/Contents/Resources/web/fonts"

  echo "==> [$APP_NAME] rendering icon"
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

  # Ad-hoc signature: arm64 refuses to launch an unsigned bundle.
  codesign --force --sign - --timestamp=none "$APP" 2>/dev/null

  if [ -e "$TARGET" ]; then
    local EXISTING
    EXISTING="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' \
                "$TARGET/Contents/Info.plist" 2>/dev/null || echo '')"
    if [ "$EXISTING" != "$BUNDLE_ID" ]; then
      echo "Refusing to replace $TARGET: not this app (id '$EXISTING')." >&2
      rm -rf "$STAGE"; return 1
    fi
    rm -rf "$TARGET"
  fi
  mkdir -p "$DEST"
  cp -R "$APP" "$TARGET"
  rm -rf "$STAGE"
  echo "==> [$APP_NAME] installed: $TARGET"
}

if [ "$VARIANT" = "all" ]; then
  build_one paritymac
  build_one paritycade
else
  build_one "$VARIANT"
fi
