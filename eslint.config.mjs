import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'test-results/**',
    'playwright-report/**',
    'blob-report/**',
    'reference/**',
    'ocr-service/**',
    'next-env.d.ts',
    'lib/database.types.ts',
    'tsconfig.tsbuildinfo',
  ]),
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // Flags any effect that calls an async loader which sets state, even when every
      // setState happens after an await. Mount flags, clocks and prop-driven resets use
      // useIsClient, useNow and render-time adjustments instead of effects.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // Test fakes expose non-React helpers named useDb/useSupabase, and Playwright
    // fixtures receive a `use` callback; neither is a React hook.
    files: ['tests/**/*.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
])
