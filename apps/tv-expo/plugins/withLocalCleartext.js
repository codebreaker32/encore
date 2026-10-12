const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

// Plain http:// and ws:// only to this device's own loopback. On the TV the relay (8787), the MC (18080) and the
// crowd test page (8091) are reached through `adb reverse`, which is loopback; every other host stays HTTPS-only,
// in release builds too.
const XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">localhost</domain>
    <domain includeSubdomains="false">127.0.0.1</domain>
  </domain-config>
</network-security-config>
`;

const withConfigFile = (config) =>
  withDangerousMod(config, [
    "android",
    async (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, "app/src/main/res/xml");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "network_security_config.xml"), XML);
      return config;
    },
  ]);

const withManifestEntry = (config) =>
  withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    return config;
  });

module.exports = (config) => withManifestEntry(withConfigFile(config));
