import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cafebara.app',
  appName: 'Café Bara',
  webDir: 'dist/public',
  server: {
    // Point the native WebView at the live Vercel deployment so that
    // OAuth redirects, API calls, and auth cookies all work on one domain.
    // Remove this line (and rebuild) if you want to ship a fully-offline bundle.
    url: 'https://artix-pos.vercel.app',
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
};

export default config;
