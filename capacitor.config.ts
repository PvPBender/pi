import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.pitrainer',
  appName: 'π Trainer',
  webDir: 'dist',
  server: {
    url: 'https://51b9dbda-ff0b-4c3a-8a53-938786fa2ff0.lovableproject.com?forceHideBadge=true',
    cleartext: true
  }
};

export default config;
