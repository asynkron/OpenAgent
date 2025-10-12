export default {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/mockOpenAI.js'],
  roots: ['<rootDir>/packages', '<rootDir>/tests'],
  moduleNameMapper: {
    '^@asynkron/openagent-core$': '<rootDir>/packages/core/index.js',
  },
  transform: {
    '^.+\\.(ts|tsx)$': [
      'babel-jest',
      {
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' }, modules: false }],
          ['@babel/preset-typescript', { allowDeclareFields: true }],
        ],
      },
    ],
  },
  extensionsToTreatAsEsm: ['ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'node'],
};
