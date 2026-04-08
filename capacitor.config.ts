import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cafebara.app',
  appName: 'ArtixPOS',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      ...(process.env.GOOGLE_CLIENT_ID ? { serverClientId: process.env.GOOGLE_CLIENT_ID } : {}),
      forceCodeForRefreshToken: true,
    },
    ...(process.env.FACEBOOK_APP_ID ? {
      FacebookLogin: {
        appId: process.env.FACEBOOK_APP_ID,
      },
    } : {}),
  },
};

export default config;
