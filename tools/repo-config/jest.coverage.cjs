const baseCoverageThreshold = {
  global: {
    statements: 85,
    branches: 80,
    functions: 85,
    lines: 85,
  },
};

const strictCoverageThreshold = {
  global: {
    statements: 95,
    branches: 95,
    functions: 95,
    lines: 95,
  },
};

module.exports = {
  baseCoverageThreshold,
  strictCoverageThreshold,
  packageCoverageThresholds: {
    '@stynx/auth': strictCoverageThreshold,
    '@stynx/data': strictCoverageThreshold,
  },
};
