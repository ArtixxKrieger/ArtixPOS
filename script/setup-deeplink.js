#!/usr/bin/env node
/**
 * Patches the native Android and iOS project files so the OS routes the
 * OAuth deep-link  com.cafebara.app://auth?token=...  back into the app.
 *
 * Run AFTER  npx cap sync:
 *   node script/setup-deeplink.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const APP_SCHEME = "com.cafebara.app";

// ── Android ───────────────────────────────────────────────────────────────────

const ANDROID_MANIFEST = path.join(
  root,
  "android/app/src/main/AndroidManifest.xml"
);

const DEEP_LINK_INTENT_FILTER = `
        <!-- OAuth deep-link: com.cafebara.app://auth?token=... -->
        <intent-filter>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.DEFAULT" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="${APP_SCHEME}" />
        </intent-filter>`;

function patchAndroid() {
  if (!fs.existsSync(ANDROID_MANIFEST)) {
    console.warn(
      "⚠  android/app/src/main/AndroidManifest.xml not found.\n" +
      "   Run  npx cap add android  first, then re-run this script."
    );
    return;
  }

  let xml = fs.readFileSync(ANDROID_MANIFEST, "utf8");

  if (xml.includes(`android:scheme="${APP_SCHEME}"`)) {
    console.log("✓ Android deep-link intent filter already present.");
    return;
  }

  // Insert the intent-filter just before the closing </activity> tag
  if (!xml.includes("</activity>")) {
    console.error("✗ Could not locate </activity> in AndroidManifest.xml.");
    return;
  }

  xml = xml.replace("</activity>", `${DEEP_LINK_INTENT_FILTER}\n    </activity>`);
  fs.writeFileSync(ANDROID_MANIFEST, xml, "utf8");
  console.log("✓ Android deep-link intent filter added to AndroidManifest.xml");
}

// ── iOS ───────────────────────────────────────────────────────────────────────

const IOS_PLIST = path.join(root, "ios/App/App/Info.plist");

const URL_SCHEME_ENTRY = `
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>${APP_SCHEME}</string>
			</array>
		</dict>
	</array>`;

function patchIOS() {
  if (!fs.existsSync(IOS_PLIST)) {
    console.warn(
      "⚠  ios/App/App/Info.plist not found.\n" +
      "   Run  npx cap add ios  first, then re-run this script."
    );
    return;
  }

  let plist = fs.readFileSync(IOS_PLIST, "utf8");

  if (plist.includes(APP_SCHEME)) {
    console.log("✓ iOS URL scheme already present in Info.plist.");
    return;
  }

  // Insert before the final </dict> closing tag
  if (!plist.includes("</dict>\n</plist>")) {
    console.error(
      "✗ Could not locate closing </dict></plist> in Info.plist.\n" +
      "   Please add the CFBundleURLTypes entry manually."
    );
    return;
  }

  plist = plist.replace(
    "</dict>\n</plist>",
    `${URL_SCHEME_ENTRY}\n</dict>\n</plist>`
  );
  fs.writeFileSync(IOS_PLIST, plist, "utf8");
  console.log("✓ iOS URL scheme added to Info.plist");
}

// ── Run ───────────────────────────────────────────────────────────────────────

console.log("\nSetting up OAuth deep-link for native platforms...\n");
patchAndroid();
patchIOS();
console.log(
  "\nDone. Now build your APK / IPA in Android Studio / Xcode.\n"
);
