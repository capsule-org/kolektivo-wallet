const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');
const pack = require('../capsule/package.json');
const nodeLibs = require('node-libs-react-native');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */

const modules = Object.keys(pack.peerDependencies);

const root1 = path.resolve(__dirname, '..', 'capsule');
const root2 = path.resolve(__dirname, '..', 'example');

const config = {
  projectRoot: __dirname,
  watchFolders: [root1, root2],
  resolver: {
    extraNodeModules: modules.reduce(
      (acc, name) => {
        acc[name] = path.join(__dirname, 'node_modules', name);
        return acc;
      },
      {
        ...nodeLibs,
        crypto: path.join(__dirname, 'node_modules', 'react-native-crypto'),
      },
    ),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
