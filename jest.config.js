module.exports = {
  preset: undefined,
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/scripts'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transform: {
    '\\.[jt]sx?$': ['babel-jest', { configFile: './babel.config.js' }],
  },
  // The example app has its own project; keep it out of the library run.
  testPathIgnorePatterns: ['/node_modules/', '/example/', '/lib/'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.nitro.ts'],
};
