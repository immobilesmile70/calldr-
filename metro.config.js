const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Support .native.ts and .web.ts platform extensions
config.resolver.sourceExts = [
  'native.ts',
  'native.tsx',
  'web.ts',
  'web.tsx',
  ...config.resolver.sourceExts,
];

module.exports = config;
