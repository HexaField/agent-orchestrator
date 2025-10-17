import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.spec.ts'],
    globals: true,
    reporters: ['verbose'],
    printConsoleTrace: true,
    silent: false,
    testTimeout: 10 * 60 * 1000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
})
