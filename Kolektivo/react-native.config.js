const path = require('path')
const pak = require('../capsule/package.json')

module.exports = {
  assets: ['./fonts'],
  dependencies: {
    [pak.name]: {
      root: path.join(__dirname, '../capsule'),
    },
  },
}
