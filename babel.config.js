module.exports = function (api) {
  api && api.cache && api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    // expo-router needs its babel plugin before other plugins
    // react-native-reanimated plugin must still be listed last
    plugins: ['expo-router/babel', 'react-native-reanimated/plugin'],
  };
};
