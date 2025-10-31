import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./tests/setup/globalSetup.ts'],
        testTimeout: 30000, // 30s for tests with AI SDK
        hookTimeout: 10000,
        include: ['tests/**/*.test.ts'],
        exclude: ['node_modules', 'dist'],
    },
    resolve: {
        alias: {
            '~': path.resolve(__dirname, './src'),
        },
    },
})
