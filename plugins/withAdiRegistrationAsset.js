const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const ASSET_NAME = 'adi-registration.properties';

module.exports = function withAdiRegistrationAsset(config) {
  return withDangerousMod(config, [
    'android',
    async currentConfig => {
      const projectRoot = currentConfig.modRequest.projectRoot;
      const sourcePath = path.join(projectRoot, 'assets', ASSET_NAME);
      const targetDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'assets');
      const targetPath = path.join(targetDir, ASSET_NAME);

      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Missing required file: ${sourcePath}`);
      }

      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);

      return currentConfig;
    },
  ]);
};
