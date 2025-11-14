// @ts-check
import eslint from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import globals from 'globals'

export default [
  eslint.configs.recommended,
  {
    ignores: [
      'dist/**/*',
      'node_modules/**/*',
      '**/*.min.js',
      '**/bundle*',
      '**/vendor/**'
    ]
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      },
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      // Basic TypeScript rules (not using recommended due to ESLint 9 + typescript-eslint v6 incompatibility)
      // Temporarily set to warn until Dependabot PRs can be merged to upgrade typescript-eslint
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-unused-vars': 'warn', // Temporary: downgrade to warn
      'no-undef': 'off', // TypeScript handles this
      'no-redeclare': 'off' // TypeScript compiler validates overloads
    }
  },
  {
    files: ['test/**/*.ts'],
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn'
    }
  }
]
