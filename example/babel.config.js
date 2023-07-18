const path = require('path');
module.exports = {
  plugins: [
    [
      'module-resolver',
      {
        extensions: ['.tsx', '.ts', '.js', '.json'],
        alias: {
          '@usecapsule/react-native-wallet': path.join(
            __dirname,
            '..',
            'capsule',
            'src',
          ),
        },
      },
    ],
  ],
  presets: ['module:metro-react-native-babel-preset'],
};
