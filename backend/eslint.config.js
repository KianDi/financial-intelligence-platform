const js = require('@eslint/js');
const prettierConfig = require('eslint-config-prettier');
const prettierPlugin = require('eslint-plugin-prettier');

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      // Serverless/Lambda specific rules
      'no-console': 'off', // Allow console.log for Lambda logging

      // AWS SDK and async/await best practices
      'prefer-const': 'error',
      'no-var': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',

      // Code quality
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-eval': 'error',
      'no-implied-eval': 'error',

      // Prettier integration
      'prettier/prettier': 'error',
    },
  },
  prettierConfig,
  {
    files: ['test*.js', '**/*.test.js'],
    rules: {
      'no-unused-vars': 'off',
    },
  },
];
