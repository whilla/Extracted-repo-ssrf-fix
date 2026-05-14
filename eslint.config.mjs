import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      'react-hooks/exhaustive-deps': 'warn',
      '@next/next/no-img-element': 'off',
      'import/no-anonymous-default-export': 'off',
    },
    ignores: [
      '.next/**',
      '**/.next/**',
      'node_modules/**',
      'tsconfig.tsbuildinfo',
      '.worktrees/**',
      '.worktrees/**/*',
      '**/.worktrees/**',
      '**/.worktrees/**/*',
    ],
  },
];

export default config;
