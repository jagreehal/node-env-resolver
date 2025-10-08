import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import globals from 'globals';
import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname
});

export default [...compat.extends("next/core-web-vitals", "next/typescript"), {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts"]
}, js.configs.recommended, {
  files: ['**/*.{ts,tsx,mts}'],
  languageOptions: {
    parser: tsparser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      project: './tsconfig.json',
    },
    globals: {
      ...globals.node,
      ...globals.es2022,
      ...globals.browser,
    },
  },
  plugins: {
    '@typescript-eslint': tseslint,
  },
  rules: {
    ...tseslint.configs.recommended.rules,
    'no-console': 'off',
    'no-debugger': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    'prefer-template': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
}, {
  files: ['**/*.{js,mjs}'],
  languageOptions: {
    globals: {
      ...globals.node,
      ...globals.es2022,
      ...globals.browser,
    },
  },
  rules: {
    'no-console': 'off',
    'no-debugger': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    'prefer-template': 'error',
  },
}];
