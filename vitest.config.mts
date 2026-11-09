import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname),
    },
  },
  test: {
    env: {
      JWT_SECRET: 'test-secret',
    },
    // These suites write ephemeral rows to a remote test database and are
    // intentionally unavailable from the default test project.
    projects: [
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/ui/**', 'tests/integration-db/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['tests/ui/**/*.test.tsx'],
          setupFiles: ['tests/ui/setup.ts'],
          testTimeout: 20_000,
        },
      },
    ],
  },
})
