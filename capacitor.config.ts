import type { CapacitorConfig } from '@capacitor/cli';

const webClientId = process.env.GOOGLE_CLIENT_ID;
const iosClientId = process.env.GOOGLE_IOS_CLIENT_ID || webClientId;

const config: CapacitorConfig = {
  appId: 'com.cafebara.app',
  appName: 'ArtixPOS',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      ...(webClientId ? { serverClientId: webClientId } : {}),
      ...(iosClientId ? { clientId: iosClientId } : {}),
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
