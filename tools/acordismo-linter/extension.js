/**
 * @file tools/acordismo-linter/extension.js
 * @version 2.4.0
 * Zero-copy VS Code Linter: uses fs.realpathSync(__dirname) so Windows Junctions
 * and Linux Symlinks both resolve back to the real git repository.
 */
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const __version__ = '2.4.0';

const diagnosticCollection = vscode.languages.createDiagnosticCollection('acordismoLinter');
let statusBarItem = null;
let modulesPromise = null;

function resolveAcordismoRoot() {
    // 1. Check if install-linter.mjs wrote an explicit .acordismo-root pointer
    const pointerFile = path.join(__dirname, '.acordismo-root');
    if (fs.existsSync(pointerFile)) {
        const target = fs.readFileSync(pointerFile, 'utf8').trim();
        if (target && fs.existsSync(target)) {
            return target;
        }
    }
    // 2. Otherwise resolve symlink/junction realpath
    const realExtDir = fs.realpathSync(__dirname);
    return path.resolve(realExtDir, '..', '..');
}

function loadSharedModules() {
    if (!modulesPromise) {
        const acordismoRoot = resolveAcordismoRoot();
        const shrSharedDir = path.resolve(
            acordismoRoot,
            '..',
            'smallhotelroom.github.io',
            'src',
            'shared'
        );
        const schemaPath = path.join(shrSharedDir, 'songSchema.js');
        const transposerPath = path.join(shrSharedDir, 'chordTransposer.js');

        modulesPromise = Promise.all([
            import(pathToFileURL(schemaPath).href),
            import(pathToFileURL(transposerPath).href),
        ]).then(([schemaMod, transposerMod]) => ({
            schemaMod,
            transposerMod,
        }));
    }
    return modulesPromise;
}

/**
 * Validates both YAML frontmatter and song chord consistency (mixed #/b or letter collisions).
 * @param {vscode.TextDocument} document
 */
async function updateDiagnostics(document) {
    if (document.languageId !== 'markdown' && document.languageId !== 'plaintext') {
        if (statusBarItem) statusBarItem.hide();
        return;
    }

    let schemaMod;
    let transposerMod;
    try {
        ({ schemaMod, transposerMod } = await loadSharedModules());
    } catch (err) {
        console.error('Acordismo Linter failed to load shared modules:', err);
        return;
    }

    const diagnostics = [];
    const text = document.getText();
    const rawFileName = path.basename(document.fileName, path.extname(document.fileName));

    let derivedArtist = null;
    if (rawFileName.includes(' - ')) {
        derivedArtist = rawFileName.split(' - ')[0].trim();
    }

    const parsed = schemaMod.parseFrontmatterFile(text);
    const effectiveArtist = parsed.data.artist || derivedArtist;

    const isStrictProject = schemaMod.STRICT_PROJECT_NAMES.includes(effectiveArtist);
    if (!isStrictProject) {
        diagnosticCollection.set(document.uri, []);
        if (statusBarItem) statusBarItem.hide();
        return;
    }

    if (statusBarItem) {
        statusBarItem.text = `$(music) Acordismo Linter v${__version__}`;
        statusBarItem.tooltip = `Linting '${rawFileName}' (${effectiveArtist})`;
        statusBarItem.show();
    }

    if (!parsed.hasFrontmatter || Object.keys(parsed.data).length === 0) {
        const range = new vscode.Range(0, 0, 0, 3);
        diagnostics.push(
            new vscode.Diagnostic(
                range,
                `🚨 ACORDISMO LINT ERROR: Missing YAML frontmatter for strict project '${effectiveArtist}'.`,
                vscode.DiagnosticSeverity.Error
            )
        );
        diagnosticCollection.set(document.uri, diagnostics);
        return;
    }

    // 1. Check missing required keys using songSchema.getMissingKeys
    const missing = schemaMod.getMissingKeys(parsed.data, rawFileName);
    if (missing.length > 0) {
        const range = new vscode.Range(0, 0, 0, 3);
        diagnostics.push(
            new vscode.Diagnostic(
                range,
                `🚨 ACORDISMO LINT ERROR: Missing required keys: ${missing.join(', ')}`,
                vscode.DiagnosticSeverity.Error
            )
        );
    }

    // 2. Check strict alphabetical order using songSchema.validateAlphabeticalOrder
    const keys = Object.keys(parsed.data);
    const { isValid, expected } = schemaMod.validateAlphabeticalOrder(keys);
    if (!isValid) {
        for (let i = 0; i < keys.length; i++) {
            if (keys[i] !== expected[i]) {
                const offendingKey = keys[i];
                const expectedKey = expected[i];
                const lineIdx = Math.max(0, (parsed.keyLines[offendingKey] ?? 1) - 1);
                const lineText = document.lineAt(lineIdx).text;
                const range = new vscode.Range(lineIdx, 0, lineIdx, lineText.length);

                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        `🚨 ACORDISMO LINT ERROR: Key '${offendingKey}' is out of alphabetical order (expected '${expectedKey}' at position ${i + 1}).\nExpected order: [${expected.join(', ')}]`,
                        vscode.DiagnosticSeverity.Error
                    )
                );
                break;
            }
        }
    }

    // 3. Check song chord palette consistency using songSchema & chordTransposer
    const sharpNotesFound = new Set();
    const flatNotesFound = new Set();
    const letterToNotes = new Map();

    const recordNote = (noteStr) => {
        if (!noteStr) return;
        if (noteStr.includes('#')) sharpNotesFound.add(noteStr);
        if (noteStr.includes('b')) flatNotesFound.add(noteStr);
        const letter = noteStr[0];
        if (!letterToNotes.has(letter)) {
            letterToNotes.set(letter, new Set());
        }
        letterToNotes.get(letter).add(noteStr);
    };

    const allLines = text.replace(/\r\n/g, '\n').split('\n');
    const startZeroIdx = Math.max(0, (parsed.bodyStartLine || 1) - 1);

    for (let lineIdx = startZeroIdx; lineIdx < allLines.length; lineIdx++) {
        const lineStr = allLines[lineIdx];
        const parenRegex = /\(([^)]+)\)/g;
        let match;
        while ((match = parenRegex.exec(lineStr)) !== null) {
            const fullParen = match[0].toLowerCase();
            if (schemaMod.SKIP_PAREN_PREFIXES.some((p) => fullParen.startsWith(p))) continue;
            if (fullParen.includes('capo') || fullParen.includes('drop')) continue;

            const tokens = match[1].split(schemaMod.CHORD_GROUP_DELIMITER_REGEX);
            for (const tok of tokens) {
                const chord = transposerMod.parseChordToken(tok);
                if (chord) {
                    recordNote(chord.rootStr);
                    if (chord.bassStr) recordNote(chord.bassStr);
                }
            }
        }
    }

    if (sharpNotesFound.size > 0 && flatNotesFound.size > 0) {
        const range = new vscode.Range(0, 0, 0, 3);
        diagnostics.push(
            new vscode.Diagnostic(
                range,
                `⚠️ ACORDISMO CHORD WARNING: Song mixes sharps (${[...sharpNotesFound].join(', ')}) and flats (${[...flatNotesFound].join(', ')}).`,
                vscode.DiagnosticSeverity.Warning
            )
        );
    }

    for (const [letter, noteSet] of letterToNotes.entries()) {
        if (noteSet.size > 1) {
            const range = new vscode.Range(0, 0, 0, 3);
            diagnostics.push(
                new vscode.Diagnostic(
                    range,
                    `⚠️ ACORDISMO CHORD WARNING: Duplicate letter root collision on '${letter}' (${[...noteSet].join(' vs ')}).`,
                    vscode.DiagnosticSeverity.Information
                )
            );
        }
    }

    diagnosticCollection.set(document.uri, diagnostics);
}

function activate(context) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusBarItem);

    if (vscode.window.activeTextEditor) {
        updateDiagnostics(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            updateDiagnostics(event.document);
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                updateDiagnostics(editor.document);
            } else if (statusBarItem) {
                statusBarItem.hide();
            }
        })
    );
}

function deactivate() {
    diagnosticCollection.clear();
}

module.exports = {
    __version__,
    activate,
    deactivate,
};
