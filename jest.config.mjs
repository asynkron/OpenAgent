import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const replaceJsExtensionsPlugin = path.join(
  configDir,
  'scripts/babel/plugins/replaceJsExtensions.cjs',
);

export default {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/mockOpenAI.js'],
  roots: ['<rootDir>/packages', '<rootDir>/tests'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^@asynkron/openagent-core$': '<rootDir>/packages/core/dist/index.js',
  },
  transform: {
    '^.+\\.(ts|tsx)$': [
      'babel-jest',
      {
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' }, modules: false }],
          ['@babel/preset-typescript', { allowDeclareFields: true }],
        ],
        plugins: [replaceJsExtensionsPlugin],
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'node'],
};
