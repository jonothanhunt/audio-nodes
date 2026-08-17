import { defineConfig } from 'vitest/config';
import path from 'path';

const root = import.meta.dirname;

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: [
            'src/**/*.test.ts',
            'src/**/*.test.tsx',
            'core-audio/**/*.test.ts',
            'public/**/*.test.js',
        ],
    },
    resolve: {
        alias: {
            '@': path.resolve(root, './src'),
            '@core-audio': path.resolve(root, './core-audio'),
        },
    },
});
