import js from '@eslint/js';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

const tsRecommendedRules = tseslint.configs.recommended.rules;

export default [
  {
    ignores: ['node_modules', 'coverage', '**/templates/**', 'scripts/**'],
  },
  js.configs.recommended,
  prettierRecommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      import: importPlugin,
    },
    rules: {
      ...tsRecommendedRules,
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-constant-condition': ['error', { checkLoops: false }],
      'prefer-const': 'error',
      'import/no-commonjs': 'error',
    },
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.ts', '.mjs', '.cjs'],
        },
        typescript: {
          project: './tsconfig.json',
        },
      },
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-constant-condition': ['error', { checkLoops: false }],
      'prefer-const': 'error',
      'import/no-commonjs': 'error',
    },
  },
  {
    files: ['scripts/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'import/no-commonjs': 'off',
      'no-undef': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-case-declarations': 'off',
    },
  },
  {
    files: ['**/scripts/**/*.{js,mjs}'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'import/no-commonjs': 'off',
      'no-undef': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-case-declarations': 'off',
    },
  },
  {
    files: ['**/tests/**/*.js', '**/__tests__/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
      ecmaVersion: 2022,
    },
    rules: {
      'no-control-regex': 'off',
    },
  },
  {
    files: ['packages/web/frontend/src/js/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
];
