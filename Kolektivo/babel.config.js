const path = require('path')
const pak = require('../capsule/package.json')

module.exports = {
  plugins: [
    [require('@babel/plugin-proposal-decorators').default, { legacy: true }],
    [
      'module:react-native-dotenv',
      {
        moduleName: 'react-native-dotenv',
        path: 'e2e/.env',
      },
    ],
    // Remove @babel/plugin-proposal-numeric-separator when we upgrade metro with the upstream fix (https://github.com/facebook/metro/pull/681)
    '@babel/plugin-proposal-numeric-separator',
    'react-native-reanimated/plugin',
    // NOTE: Reanimated plugin has to be listed last.
    [
      'module-resolver',
      {
        extensions: ['.tsx', '.ts', '.js', '.json'],
        alias: {
          [pak.name]: path.join(__dirname, '..', 'capsule', 'src'),
        },
      },
    ],
  ],
  presets: ['module:metro-react-native-babel-preset'],
}
