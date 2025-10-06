import baseConfig from './eslint.config';
export default [
  ...baseConfig,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    rules: {
      // Next.js specific overrides
      'react/prop-types': 'off', // TypeScript handles this
      'react/react-in-jsx-scope': 'off', // Next.js handles this
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      
      // Next.js best practices
      '@next/next/no-html-link-for-pages': 'error',
      '@next/next/no-img-element': 'warn',
      '@next/next/no-page-custom-font': 'warn',
      '@next/next/no-sync-scripts': 'error',
      '@next/next/no-title-in-document-head': 'warn',
      '@next/next/no-unwanted-polyfillio': 'error',
      
      // Allow console in Next.js for debugging
      'no-console': 'off'
    }
  },
  {
    files: ['**/app/**/*.{ts,tsx}', '**/pages/**/*.{ts,tsx}'],
    rules: {
      // App directory specific rules
      '@next/next/no-head-element': 'error',
      '@next/next/no-head-import-in-document': 'error'
    }
  }
];
