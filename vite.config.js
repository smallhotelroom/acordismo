/**
 * @file vite.config.js
 * @version 2.2.0
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export const __version__ = '2.2.0';

export default defineConfig({
    plugins: [react()],
    optimizeDeps: {
        include: ['sql.js', 'chord-transposer'],
    },
    server: {
        hmr: {
            overlay: true,
        },
    },
});
