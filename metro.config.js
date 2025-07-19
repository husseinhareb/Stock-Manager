// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

module.exports = (async () => {
  // 1. Grab Expo's default Metro config
  const config = await getDefaultConfig(__dirname);

  // 2. Keep WebAssembly files as assets
  config.resolver.assetExts.push('wasm');

  // 3. Ensure Metro treats these extensions as source (so Babel runs on them)
  config.resolver.sourceExts = [
    ...config.resolver.sourceExts,
    'cjs',
    'mjs',
    'ts',
    'tsx',
  ];

  return config;
})();
