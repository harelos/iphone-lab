#!/bin/bash
# Builds FBIAB.app for the iOS Simulator with no Xcode project.
set -euo pipefail
cd "$(dirname "$0")"
OUT=build/FBIAB.app
rm -rf build && mkdir -p "$OUT"
ARCH=$(uname -m)   # arm64 on Apple-silicon runners
SDK=$(xcrun --sdk iphonesimulator --show-sdk-path)
xcrun --sdk iphonesimulator swiftc -O -target "${ARCH}-apple-ios16.4-simulator" -sdk "$SDK" main.swift -o "$OUT/FBIAB"
cat > "$OUT/Info.plist" <<'PL'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.tbg.lab.fbiab</string>
<key>CFBundleExecutable</key><string>FBIAB</string>
<key>CFBundleName</key><string>FBIAB</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>MinimumOSVersion</key><string>16.4</string>
<key>UIDeviceFamily</key><array><integer>1</integer></array>
<key>UILaunchScreen</key><dict/>
<key>UIRequiredDeviceCapabilities</key><array><string>arm64</string></array>
<key>LSRequiresIPhoneOS</key><true/>
<key>UISupportedInterfaceOrientations</key><array><string>UIInterfaceOrientationPortrait</string></array>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsArbitraryLoads</key><true/></dict>
<key>CFBundleSupportedPlatforms</key><array><string>iPhoneSimulator</string></array>
</dict></plist>
PL
codesign -s - --force "$OUT" >/dev/null 2>&1 || true
echo "built $OUT"
