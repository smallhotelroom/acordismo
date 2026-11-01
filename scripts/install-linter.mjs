#!/usr/bin/env node
/**
 * @file scripts/install-linter.mjs
 * @version 1.1.0
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const __version__ = '1.1.0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const MASTER_SCHEMA_PATH = path.join(ROOT_DIR, 'src', 'shared', 'songSchema.js');
const LINTER_SRC_DIR = path.join(ROOT_DIR, 'tools', 'acordismo-linter');
const VSCODE_EXT_DIR = path.join(os.homedir(), '.vscode', 'extensions');
const WEBSITE_SCHEMA_PATH = path.resolve(
    ROOT_DIR,
    '../smallhotelroom.github.io/src/shared/songSchema.js'
);

function buildCommonJsSchema(esmSource) {
    const stripped = esmSource
        .replace(/export const /g, 'const ')
        .replace(/export function /g, 'function ');

    return (
        `/* 🚨 AUTO-GENERATED FROM src/shared/songSchema.js — DO NOT EDIT DIRECTLY 🚨 */\n` +
        stripped +
        `\nmodule.exports = {\n` +
        `    __version__,\n` +
        `    BASE_REQUIRED_KEYS,\n` +
        `    STRICT_PROJECT_NAMES,\n` +
        `    STRICT_PROJECT_KEYS,\n` +
        `    TREATED_KEYS,\n` +
        `    SKIP_PAREN_PREFIXES,\n` +
        `    CHORD_GROUP_DELIMITER_SOURCE,\n` +
        `    CHORD_GROUP_DELIMITER_REGEX,\n` +
        `    validateAlphabeticalOrder,\n` +
        `    getMissingKeys,\n` +
        `    validateFrontmatter,\n` +
        `    parseFrontmatterFile,\n` +
        `};\n`
    );
}

function main() {
    const pkgPath = path.join(LINTER_SRC_DIR, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        console.error(`❌ Could not find ${pkgPath}`);
        process.exit(1);
    }

    const masterSchemaContent = fs.readFileSync(MASTER_SCHEMA_PATH, 'utf8');
    const cjsSchemaContent = buildCommonJsSchema(masterSchemaContent);

    // 1. Sync CommonJS copy into tools/acordismo-linter/shared/songSchema.js
    const linterSharedDir = path.join(LINTER_SRC_DIR, 'shared');
    fs.mkdirSync(linterSharedDir, { recursive: true });
    fs.writeFileSync(path.join(linterSharedDir, 'songSchema.js'), cjsSchemaContent, 'utf8');

    // 2. If sibling smallhotelroom.github.io repo exists, sync the ESM master there too
    if (fs.existsSync(path.dirname(WEBSITE_SCHEMA_PATH))) {
        fs.writeFileSync(WEBSITE_SCHEMA_PATH, masterSchemaContent, 'utf8');
        console.log(`🔄 Synced master songSchema.js to ${WEBSITE_SCHEMA_PATH}`);
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

    fs.mkdirSync(path.join(targetDir, 'shared'), { recursive: true });
    for (const file of ['package.json', 'extension.js']) {
        fs.copyFileSync(path.join(LINTER_SRC_DIR, file), path.join(targetDir, file));
    }
    fs.writeFileSync(
        path.join(targetDir, 'shared', 'songSchema.js'),
        cjsSchemaContent,
        'utf8'
    );

    console.log(`✅ Installed ${targetFolderName} to ${targetDir}`);
    console.log(`🔄 Reload VS Code (Ctrl+Shift+P -> "Developer: Reload Window") to activate!`);
}

main();
