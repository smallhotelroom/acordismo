/**
 * @file vite.config.js
 * @version 1.2.0
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export const __version__ = '1.2.0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@shr-shared': path.resolve(__dirname, 'src/shared'),
        },
    },
});
