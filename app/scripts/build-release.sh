#!/bin/bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="OpenClaude"
APP_VERSION=$(node -e "console.log(require('$APP_DIR/package.json').version)")
ARCH="arm64"
ELECTRON_VER=$(node -e "console.log(require('$APP_DIR/node_modules/electron/package.json').version)")
ELECTRON_TEMPLATE="$APP_DIR/node_modules/electron/dist/Electron.app"
ELECTRON_ZIP="$HOME/.cache/electron/v${ELECTRON_VER}/electron-v${ELECTRON_VER}-darwin-${ARCH}.zip"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/openclaude-release.XXXXXX")"
APP_CONTENT="$TEMP_ROOT/app-content"
OUTPUT="$TEMP_ROOT/output"
FINAL_OUTPUT="$APP_DIR/build/release"
FINAL_BUNDLE="$FINAL_OUTPUT/${APP_NAME}.app"
FINAL_DMG_PATH="$FINAL_OUTPUT/${APP_NAME}-${APP_VERSION}-${ARCH}.dmg"

cleanup() {
  rm -rf "$TEMP_ROOT"
}

trap cleanup EXIT

echo "=== OpenClaude Release Build ==="
echo "App dir: $APP_DIR"
echo "Version: $APP_VERSION"
echo "Electron: $ELECTRON_VER"

echo ""
echo "[1/8] Building frontend + electron..."
cd "$APP_DIR"
npm run build

echo ""
echo "[2/8] Preparing app content..."
mkdir -p "$APP_CONTENT"

cp package.json "$APP_CONTENT/"
if [ -f package-lock.json ]; then
  cp package-lock.json "$APP_CONTENT/"
fi
cp -r dist "$APP_CONTENT/"
cp -r dist-electron "$APP_CONTENT/"

echo ""
echo "[3/8] Installing production dependencies..."
cd "$APP_CONTENT"
if [ -f package-lock.json ]; then
  npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefer-offline 2>&1 | tail -3
else
  npm install --omit=dev --ignore-scripts --no-audit --no-fund --prefer-offline 2>&1 | tail -3
fi

echo ""
echo "[4/8] Applying SDK patches..."
cp -r "$APP_DIR/scripts" "$APP_CONTENT/scripts"
node scripts/patch-open-agent-sdk.mjs
rm -rf "$APP_CONTENT/scripts" "$APP_CONTENT/package-lock.json" "$APP_CONTENT/.package-lock.json"

echo ""
echo "[5/8] Assembling app bundle..."
mkdir -p "$OUTPUT"

BUNDLE="$OUTPUT/${APP_NAME}.app"

if [ -d "$ELECTRON_TEMPLATE" ]; then
  ditto "$ELECTRON_TEMPLATE" "$BUNDLE"
else
  if [ ! -f "$ELECTRON_ZIP" ]; then
    echo "  Downloading Electron $ELECTRON_VER..."
    mkdir -p "$(dirname "$ELECTRON_ZIP")"
    curl -fSL "https://github.com/electron/electron/releases/download/v${ELECTRON_VER}/electron-v${ELECTRON_VER}-darwin-${ARCH}.zip" -o "$ELECTRON_ZIP"
  fi
  ditto -xk "$ELECTRON_ZIP" "$OUTPUT/_electron_tmp"
  mv "$OUTPUT/_electron_tmp/Electron.app" "$BUNDLE"
  rm -rf "$OUTPUT/_electron_tmp"
fi

RESOURCES="$BUNDLE/Contents/Resources"
rm -f "$RESOURCES/default_app.asar"

echo "  Replacing app icon..."
cp "$APP_DIR/build/icon.icns" "$RESOURCES/electron.icns"

echo "  Packing asar..."
npx -y @electron/asar pack "$APP_CONTENT" "$RESOURCES/app.asar" \
  --unpack "{node_modules/@shipany/open-agent-sdk/**}"

PLIST="$BUNDLE/Contents/Info.plist"
set_plist_value() {
  local key="$1"
  local type="$2"
  local value="$3"
  if ! /usr/libexec/PlistBuddy -c "Set :$key $value" "$PLIST" 2>/dev/null; then
    /usr/libexec/PlistBuddy -c "Add :$key $type $value" "$PLIST"
  fi
}

set_plist_value "CFBundleName" "string" "$APP_NAME"
set_plist_value "CFBundleDisplayName" "string" "$APP_NAME"
set_plist_value "CFBundleIdentifier" "string" "com.openclaude.app"
set_plist_value "CFBundleShortVersionString" "string" "$APP_VERSION"
set_plist_value "CFBundleVersion" "string" "$APP_VERSION"
set_plist_value "CFBundleIconFile" "string" "electron.icns"

echo ""
echo "[6/8] Ad-hoc code signing..."
xattr -cr "$BUNDLE"
codesign --force --deep --sign - "$BUNDLE"
echo "  Signed (ad-hoc)."

echo ""
echo "[7/8] Running packaged app smoke test..."
node "$APP_DIR/scripts/package-smoke.mjs" "$BUNDLE"

echo ""
echo "[8/8] Creating DMG..."
DMG_PATH="$OUTPUT/${APP_NAME}-${APP_VERSION}-${ARCH}.dmg"
hdiutil create -volname "OpenClaude" -srcfolder "$BUNDLE" \
  -ov -format UDZO "$DMG_PATH" 2>&1 | tail -3

mkdir -p "$FINAL_OUTPUT"
rm -rf "$FINAL_BUNDLE" "$FINAL_DMG_PATH"
ditto "$BUNDLE" "$FINAL_BUNDLE"
cp "$DMG_PATH" "$FINAL_DMG_PATH"

echo ""
echo "=== Done ==="
ls -lh "$FINAL_DMG_PATH"
echo ""
echo "App: $FINAL_BUNDLE"
echo "DMG: $FINAL_DMG_PATH"
echo ""
echo "NOTE: This is ad-hoc signed (no Apple Developer ID)."
echo "If macOS still blocks it, the recipient should run:"
echo "  xattr -cr /Applications/OpenClaude.app"
