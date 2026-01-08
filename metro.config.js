const { getDefaultConfig } = require("@expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts = [
  // keep existing extensions and ensure TS/CJS are supported
  ...(config.resolver.sourceExts || []),
  "cjs",
  "ts",
  "tsx",
];

module.exports = config;
