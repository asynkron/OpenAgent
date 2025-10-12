import tsJestPresets from 'ts-jest/presets/default-esm/jest-preset.js';

const tsJestTransform = Object.fromEntries(
  Object.entries(tsJestPresets.transform).map(([pattern, transformer]) => {
    if (Array.isArray(transformer)) {
      const [module, options] = transformer;
      return [pattern, [module, { ...options, tsconfig: '<rootDir>/tsconfig.json' }]];
    }
    return [pattern, transformer];
  }),
);

export default {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/mockOpenAI.js'],
  roots: ['<rootDir>/packages', '<rootDir>/tests'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: tsJestTransform,
  moduleNameMapper: {
    '^@asynkron/openagent-core$': '<rootDir>/packages/core/dist/index.js',
  },
  moduleFileExtensions: ['ts', 'js', 'mjs', 'cjs', 'json'],
  resolver: '<rootDir>/jest.resolver.cjs',
};
