import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        coverage: {
            reporter: ['text', 'html'],
            exclude: ['tests/', 'dist/', 'node_modules/']
        },
        globals: true
    }
});
