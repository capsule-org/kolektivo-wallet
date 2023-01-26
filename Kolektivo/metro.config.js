const path = require('path')
const nodeLibs = require('node-libs-react-native')
const exclusionList = require('metro-config/src/defaults/exclusionList')
const escapeStringRegexp = require('escape-string-regexp')
const pak = require('../capsule/package.json')
const isE2E = process.env.CELO_TEST_CONFIG === 'e2e'

const root = path.resolve(__dirname, '..', 'capsule')
const root2 = path.resolve(__dirname, '..', 'Kolektivo')
const escapedRoot = escapeStringRegexp(root)
const modules = Object.keys({
  ...pak.peerDependencies,
})
const blist = modules.map((m) => new RegExp(`^${escape(path.join(root, 'node_modules', m))}\\/.*$`))
const defaultSourceExts = require('metro-config/src/defaults/defaults').sourceExts
const defaultAssetExts = require('metro-config/src/defaults/defaults').assetExts

module.exports = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  projectRoot: __dirname,
  watchFolders: [root],
  resolver: {
    assetExts: [...defaultAssetExts, 'txt'],
    blacklistRE: exclusionList(
      isE2E ? blist : blist.concat([RegExp(`${escapedRoot}\/e2e\/mocks/.*`)])
    ),
    extraNodeModules: {
      ...nodeLibs,
      fs: require.resolve('react-native-fs'),
      'isomorphic-fetch': require.resolve('cross-fetch'),
      net: require.resolve('react-native-tcp'),
      vm: require.resolve('vm-browserify'),
      ...modules.reduce((acc, name) => {
        acc[name] = path.join(__dirname, 'node_modules', name)
        return acc
      }, {}),
    },
    sourceExts: isE2E ? ['e2e.ts', 'e2e.js'].concat(defaultSourceExts) : defaultSourceExts,
  },
}
