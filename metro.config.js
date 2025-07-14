// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

module.exports = (async () => {
  const config = await getDefaultConfig(__dirname);
  // Enable .wasm as an asset
  config.resolver.assetExts.push('wasm');
  // If needed, handle .cjs/.mjs in dependencies
  config.resolver.sourceExts.push('cjs', 'mjs');
  return config;
})();
