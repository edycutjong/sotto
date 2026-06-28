const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: [],
  testEnvironment: 'jest-environment-jsdom',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  modulePathIgnorePatterns: ['<rootDir>/e2e/'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/lib/**/*.ts',
    '!src/lib/confetti.ts',
  ],
};

module.exports = createJestConfig(customJestConfig);
