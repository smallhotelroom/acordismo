#!/usr/bin/env node
/**
 * @file scripts/install-linter.mjs
 * @version 2.0.0
 * Zero-copy installer: symlinks tools/acordismo-linter directly into ~/.vscode/extensions/
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const __version__ = '2.0.0';

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

    // Remove any leftover generated shared/ folder if it was created previously
    const oldGeneratedShared = path.join(LINTER_SRC_DIR, 'shared');
    if (fs.existsSync(oldGeneratedShared)) {
        fs.rmSync(oldGeneratedShared, { recursive: true, force: true });
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const targetFolderName = `${pkg.publisher}.${pkg.name}-${pkg.version}`;
    const targetLinkPath = path.join(VSCODE_EXT_DIR, targetFolderName);

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

    // Create a directory symlink (junction on Windows, symlink on Linux/macOS)
    const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(LINTER_SRC_DIR, targetLinkPath, symlinkType);

    console.log(`✅ Symlinked ${targetLinkPath} -> ${LINTER_SRC_DIR}`);
    console.log(`🔄 Reload VS Code (Ctrl+Shift+P -> "Developer: Reload Window") to activate!`);
}

main();
