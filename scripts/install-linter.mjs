#!/usr/bin/env node
/**
 * @file scripts/install-linter.mjs
 * @version 1.0.0
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const __version__ = '1.0.0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const LINTER_SRC_DIR = path.join(ROOT_DIR, 'tools', 'acordismo-linter');
const VSCODE_EXT_DIR = path.join(os.homedir(), '.vscode', 'extensions');

function main() {
    const pkgPath = path.join(LINTER_SRC_DIR, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        console.error(`❌ Could not find ${pkgPath}`);
        process.exit(1);
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const targetFolderName = `${pkg.publisher}.${pkg.name}-${pkg.version}`;
    const targetDir = path.join(VSCODE_EXT_DIR, targetFolderName);

    fs.mkdirSync(VSCODE_EXT_DIR, { recursive: true });

    // Clean up any older versions of cordismo-linter or acordismo-linter
    for (const entry of fs.readdirSync(VSCODE_EXT_DIR)) {
        if (
            entry.startsWith('cordismo.cordismo-linter') ||
            entry.startsWith('smallhotelroom.acordismo-linter')
        ) {
            const oldPath = path.join(VSCODE_EXT_DIR, entry);
            fs.rmSync(oldPath, { recursive: true, force: true });
            console.log(`🧹 Removed previous extension: ${entry}`);
        }
    }

    fs.mkdirSync(targetDir, { recursive: true });
    for (const file of ['package.json', 'extension.js']) {
        fs.copyFileSync(path.join(LINTER_SRC_DIR, file), path.join(targetDir, file));
    }

    console.log(`✅ Installed ${targetFolderName} to ${targetDir}`);
    console.log(`🔄 Reload VS Code (Ctrl+Shift+P -> "Developer: Reload Window") to activate!`);
}

main();
