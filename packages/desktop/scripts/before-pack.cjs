const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const { Arch } = require('builder-util');

exports.default = async function prepareClaimRuntime(context) {
  execFileSync(process.execPath, [join(__dirname, 'prepare-runtime.mjs'), context.electronPlatformName, Arch[context.arch]], { stdio: 'inherit' });
};
