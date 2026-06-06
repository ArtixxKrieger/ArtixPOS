#!/usr/bin/env node
/**
 * Patches the Android AndroidManifest.xml with a Google OAuth deep-link
 * intent filter so the redirect after sign-in lands back in the app.
 *
 * Capacitor CLI v8 sometimes strips custom intent-filter entries during
 * `cap sync`, so this script runs AFTER `cap add android` but BEFORE
 * `cap sync android` to guarantee the deep-link is always present.
 *
 * Expected Google redirect URI pattern:
 *   https://com.artixpos.app:/oauth2redirect
 *
 * This matches the redirect URI registered in the Google Cloud Console.
 */

const fs = require("fs");
const path = require("path");

const manifestPath = path.join(
  __dirname,
  "..",
  "android",
  "app",
  "src",
  "main",
  "AndroidManifest.xml",
);

console.log("[setup-deeplink] Patching AndroidManifest.xml for OAuth deep-link...");

if (!fs.existsSync(manifestPath)) {
  console.warn(
    "[setup-deeplink] AndroidManifest.xml not found — is android platform initialised? Skipping.",
  );
  process.exit(0);
}

let manifest = fs.readFileSync(manifestPath, "utf8");

// Google OAuth redirect scheme: "com.artixpos.app:/oauth2redirect"
const intentFilter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="com.artixpos.app" android:pathPrefix="/oauth2redirect" />
            </intent-filter>`;

// Check if the intent filter already exists
if (manifest.includes('android:host="com.artixpos.app"')) {
  console.log("[setup-deeplink] Deep-link intent filter already present — skipping.");
  process.exit(0);
}

// Inject into the main <activity> block (the one with android:launchMode)
const activityRegex = /(<activity[^>]*android:name="[^"]*"[^>]*>)/;
const match = manifest.match(activityRegex);

if (!match) {
  console.warn("[setup-deeplink] Could not find main activity in AndroidManifest.xml — skipping.");
  process.exit(0);
}

// Insert the intent filter after the opening <activity> tag
manifest = manifest.replace(match[0], match[0] + intentFilter);

fs.writeFileSync(manifestPath, manifest, "utf8");
console.log("[setup-deeplink] ✅ Deep-link intent filter injected for Google OAuth.");
