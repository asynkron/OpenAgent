export default {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/mockOpenAI.js'],
  roots: ['<rootDir>/packages', '<rootDir>/tests'],
  moduleNameMapper: {
    '^@asynkron/openagent-core$': '<rootDir>/packages/core/index.js',
  },
};
