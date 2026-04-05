#!/bin/bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STAGING="/tmp/openclaude-release-staging"
APP_CONTENT="/tmp/openclaude-app-content"
OUTPUT="/tmp/openclaude-release-output"
ELECTRON_VER=$(node -e "console.log(require('$APP_DIR/node_modules/electron/package.json').version)")
ELECTRON_ZIP="$HOME/.cache/electron/v${ELECTRON_VER}/electron-v${ELECTRON_VER}-darwin-arm64.zip"

echo "=== OpenClaude Release Build ==="
echo "App dir: $APP_DIR"
echo "Electron: $ELECTRON_VER"

echo ""
echo "[1/6] Building frontend + electron..."
cd "$APP_DIR"
npm run build

echo ""
echo "[2/6] Preparing app content..."
rm -rf "$APP_CONTENT"
mkdir -p "$APP_CONTENT"

cp package.json "$APP_CONTENT/"
cp -r dist "$APP_CONTENT/"
cp -r dist-electron "$APP_CONTENT/"

echo ""
echo "[3/6] Installing production dependencies..."
cd "$APP_CONTENT"
npm install --omit=dev --ignore-scripts 2>&1 | tail -3

echo ""
echo "[4/6] Applying SDK patches..."
cp -r "$APP_DIR/scripts" "$APP_CONTENT/scripts"
node scripts/patch-open-agent-sdk.mjs
rm -rf "$APP_CONTENT/scripts" "$APP_CONTENT/.package-lock.json"

echo ""
echo "[5/6] Assembling app bundle..."

if [ ! -f "$ELECTRON_ZIP" ]; then
  echo "  Downloading Electron $ELECTRON_VER..."
  mkdir -p "$(dirname "$ELECTRON_ZIP")"
  curl -fSL "https://github.com/electron/electron/releases/download/v${ELECTRON_VER}/electron-v${ELECTRON_VER}-darwin-arm64.zip" -o "$ELECTRON_ZIP"
fi

rm -rf "$OUTPUT"
mkdir -p "$OUTPUT"

BUNDLE="$OUTPUT/OpenClaude.app"
ditto -xk "$ELECTRON_ZIP" "$OUTPUT/_electron_tmp"
mv "$OUTPUT/_electron_tmp/Electron.app" "$BUNDLE"
rm -rf "$OUTPUT/_electron_tmp"

RESOURCES="$BUNDLE/Contents/Resources"
rm -f "$RESOURCES/default_app.asar"

echo "  Packing asar..."
npx -y @electron/asar pack "$APP_CONTENT" "$RESOURCES/app.asar" \
  --unpack "{node_modules/@shipany/open-agent-sdk/**}"

PLIST="$BUNDLE/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleName OpenClaude" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable Electron" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.openclaude.app" "$PLIST"

echo ""
echo "[6/6] Creating DMG..."
DMG_PATH="$OUTPUT/OpenClaude-0.1.0-arm64.dmg"
hdiutil create -volname "OpenClaude" -srcfolder "$BUNDLE" \
  -ov -format UDZO "$DMG_PATH" 2>&1 | tail -3

xattr -cr "$BUNDLE"

echo ""
echo "=== Done ==="
ls -lh "$DMG_PATH"
echo ""
echo "App: $BUNDLE"
echo "DMG: $DMG_PATH"
