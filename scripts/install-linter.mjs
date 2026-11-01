#!/usr/bin/env node
/**
 * @file scripts/install-linter.mjs
 * @version 2.1.0
 * Zero-copy installer: symlinks tools/acordismo-linter into ~/.vscode/extensions/
 * AND registers it in ~/.vscode/extensions/extensions.json (required on Windows VS Code).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const __version__ = '2.1.0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const LINTER_SRC_DIR = path.join(ROOT_DIR, 'tools', 'acordismo-linter');
const VSCODE_EXT_DIR = path.join(os.homedir(), '.vscode', 'extensions');

function registerInExtensionsJson(extDir, pkg, targetFolderName, targetLinkPath) {
    const manifestPath = path.join(extDir, 'extensions.json');
    let list = [];
    if (fs.existsSync(manifestPath)) {
        try {
            list = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            if (!Array.isArray(list)) list = [];
        } catch {
            list = [];
        }
    }

    const extId = `${pkg.publisher}.${pkg.name}`.toLowerCase();
    // Remove old entries for cordismo-linter or acordismo-linter
    list = list.filter((item) => {
        const id = item?.identifier?.id?.toLowerCase() || '';
        return id !== 'cordismo.cordismo-linter' && id !== extId;
    });

    const normalizedPath = targetLinkPath.replace(/\\/g, '/');
    const fileUri = pathToFileURL(targetLinkPath).href;

    list.push({
        identifier: {
            id: extId,
        },
        version: pkg.version,
        location: {
            $mid: 1,
            fsPath: targetLinkPath,
            _sep: path.sep === '\\' ? 1 : undefined,
            external: fileUri,
            path: normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`,
            scheme: 'file',
        },
        relativeLocation: targetFolderName,
        metadata: {
            installedTimestamp: Date.now(),
            pinned: false,
            source: 'vsix',
        },
    });

    fs.writeFileSync(manifestPath, JSON.stringify(list), 'utf8');
}

function main() {
    const pkgPath = path.join(LINTER_SRC_DIR, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        console.error(`❌ Could not find ${pkgPath}`);
        process.exit(1);
    }

    // Write pointer file so Windows Junctions always know the exact repo root
    fs.writeFileSync(path.join(LINTER_SRC_DIR, '.acordismo-root'), ROOT_DIR, 'utf8');

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const targetFolderName = `${pkg.publisher}.${pkg.name}-${pkg.version}`;
    const targetLinkPath = path.join(VSCODE_EXT_DIR, targetFolderName);

    fs.mkdirSync(VSCODE_EXT_DIR, { recursive: true });

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

    const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(LINTER_SRC_DIR, targetLinkPath, symlinkType);

    registerInExtensionsJson(VSCODE_EXT_DIR, pkg, targetFolderName, targetLinkPath);

    console.log(`✅ Symlinked & registered ${targetFolderName} -> ${LINTER_SRC_DIR}`);
    console.log(`🔄 Restart or Reload VS Code (Ctrl+Shift+P -> "Developer: Reload Window") to activate!`);
}

main();
