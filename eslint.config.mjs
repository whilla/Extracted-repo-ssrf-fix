import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
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
