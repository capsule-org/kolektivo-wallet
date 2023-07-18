const path = require('path');
const pak = require('../capsule/package.json');

module.exports = {
  dependencies: {
    [pak.name]: {
      root: path.join(__dirname, '../capsule'),
    },
  },
};
