import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Harness Agent',
  slug: 'harness-agent-mobile',
  version: '0.1.0',
  orientation: 'default',
  scheme: 'harness-agent',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.harness.agent',
  },
  android: {
    package: 'com.harness.agent',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
    },
  },
  plugins: ['expo-router', 'expo-notifications'],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
