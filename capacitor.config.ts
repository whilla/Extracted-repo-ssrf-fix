import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.nexus.app',
  appName: 'nexusai',
  webDir: 'www',
  // For development: use live dev server
  // Android emulator uses 10.0.2.2 to reach host machine
  server: process.env.NODE_ENV === 'development' ? {
    url: 'http://10.0.2.2:3000',
    cleartext: true,
  } : undefined,
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: "#0a0a0a",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showOnLaunch: true,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0a0a",
    },
  },
};

export default config;
