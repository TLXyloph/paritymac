#!/bin/bash
# Packages the app as a drag-to-install .dmg.
#
#   ./scripts/make-dmg.sh [outdir]        # default: ./dist
#
# Unsigned builds still trip Gatekeeper on another machine. To produce a disk
# image that opens first try, you need an Apple Developer Program membership:
#
#   SIGN_ID="Developer ID Application: Your Name (TEAMID)" \
#   NOTARY_PROFILE=paritymac ./scripts/make-dmg.sh
#
# where NOTARY_PROFILE was created once with:
#   xcrun notarytool store-credentials paritymac \
#     --apple-id you@example.com --team-id TEAMID --password <app-specific-password>
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="${APP_NAME:-Paritymac}"
VERSION="${VERSION:-1.1.0}"
OUT="${1:-$ROOT/dist}"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
ROOTDIR="$STAGE/$APP_NAME"
mkdir -p "$ROOTDIR"

# Build straight into the image's staging directory.
"$ROOT/scripts/build-app.sh" "$ROOTDIR"

# The conventional drag-to-install layout.
ln -s /Applications "$ROOTDIR/Applications"

mkdir -p "$OUT"
DMG="$OUT/$APP_NAME-$VERSION.dmg"
rm -f "$DMG"

echo "==> building disk image"
hdiutil create -quiet -volname "$APP_NAME" -srcfolder "$ROOTDIR" \
               -ov -format UDZO "$DMG"

if [ -n "${SIGN_ID:-}" ] && [ "${SIGN_ID:-}" != "-" ]; then
  echo "==> signing disk image"
  codesign --force --sign "$SIGN_ID" --timestamp "$DMG"
fi

if [ -n "${NOTARY_PROFILE:-}" ]; then
  echo "==> notarising (Apple scans it; this takes a few minutes)"
  xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait
  # Stapling attaches the ticket so the image verifies offline.
  xcrun stapler staple "$DMG"
  spctl -a -t open --context context:primary-signature -v "$DMG" || true
else
  echo "==> not notarised: this image will show Gatekeeper's warning on"
  echo "    another Mac. See the README."
fi

echo "==> built: $DMG  ($(du -h "$DMG" | cut -f1))"
