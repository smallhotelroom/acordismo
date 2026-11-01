/**
 * @file vite.config.js
 * @version 1.2.0
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export const __version__ = '1.2.0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve smallhotelroom.github.io/src/shared on host (../smallhotelroom.github.io) or inside Docker (/smallhotelroom.github.io)
const hostShrShared = path.resolve(__dirname, '../smallhotelroom.github.io/src/shared');
const dockerShrShared = '/smallhotelroom.github.io/src/shared';
const resolvedShrShared = fs.existsSync(hostShrShared) ? hostShrShared : dockerShrShared;

if (!fs.existsSync(path.join(resolvedShrShared, 'chordTransposer.js'))) {
    throw new Error(
        `[Draconian Check] Hard dependency 'smallhotelroom.github.io/src/shared/chordTransposer.js' not found at ${resolvedShrShared}`
    );
}

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@shr-shared': resolvedShrShared,
        },
    },
    server: {
        fs: {
            allow: ['..', resolvedShrShared],
        },
    },
});
