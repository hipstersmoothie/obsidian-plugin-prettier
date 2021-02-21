/* eslint-disable @typescript-eslint/no-var-requires */

const fs = require("fs");
const path = require("path");
const semver = require("semver");

module.exports = class TestPlugin {
  constructor() {
    this.name = "obsidian";
  }

  /**
   * Tap into auto plugin points.
   * @param {import('@auto-it/core').default} auto
   */
  apply(auto) {
    auto.hooks.modifyConfig.tap(this.name, (config) => ({
      ...config,
      noVersionPrefix: true,
    }));

    auto.hooks.version.tapPromise(this.name, async ({ bump }) => {
      // Update the manifest.json
      const manifestPath = path.join(__dirname, "../manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

      manifest.version = semver.inc(manifest.version, bump);

      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      // Update the versions.json
      const versionsPath = path.join(__dirname, "../versions.json");
      const versions = JSON.parse(fs.readFileSync(versionsPath, "utf-8"));

      versions[manifest.version] = manifest.minAppVersion;

      fs.writeFileSync(manifestPath, JSON.stringify(versions, null, 2));
    });
  }
};
