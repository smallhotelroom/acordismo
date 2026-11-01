/**
 * @file tools/acordismo-linter/extension.js
 * @version 2.5.0
 * Zero-copy VS Code Linter & Live Chord Decorator for Acordismo.
 * Active on strict projects (Small Hotel Room, cancionesdejuan) AND all songs in ACORDISMO_CURATED_DIR.
 */
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const __version__ = '2.5.0';

const diagnosticCollection = vscode.languages.createDiagnosticCollection('acordismoLinter');
let statusBarItem = null;
let modulesPromise = null;

// Live Editor Decorations so you can immediately see the linter is alive
const parenBlockDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: '3px',
});

const chordTokenDecoration = vscode.window.createTextEditorDecorationType({
    color: '#f59e0b', // Amber/Gold for valid chords & parens
    fontWeight: 'bold',
});

const directiveDecoration = vscode.window.createTextEditorDecorationType({
    color: '#a78bfa', // Soft purple for (capo ...), (drop ...), (bpm ...)
    fontWeight: 'bold',
});

const choirDecoration = vscode.window.createTextEditorDecorationType({
    color: '#34d399', // Emerald italic for [choir / backing vocals]
    fontStyle: 'italic',
});

function resolveAcordismoRoot() {
    const pointerFile = path.join(__dirname, '.acordismo-root');
    if (fs.existsSync(pointerFile)) {
        const target = fs.readFileSync(pointerFile, 'utf8').trim();
        if (target && fs.existsSync(target)) {
            return target;
        }
    }
    const realExtDir = fs.realpathSync(__dirname);
    return path.resolve(realExtDir, '..', '..');
}

/**
 * Reads ACORDISMO_CURATED_DIR and ACORDISMO_OFFICIAL_DIR from acordismo/.env
 * so curated songs get full chord highlighting and linting automatically.
 */
function loadConfiguredSongDirs(acordismoRoot) {
    const dirs = [
        path.resolve(acordismoRoot, '..', 'smallhotelroom.github.io', 'src', 'contents', 'songs'),
    ];

    const envPath = path.join(acordismoRoot, '.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const rawLine of content.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;
            const eqIdx = line.indexOf('=');
            if (eqIdx === -1) continue;
            const key = line.slice(0, eqIdx).trim();
            let val = line.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
            if (key === 'ACORDISMO_CURATED_DIR' || key === 'ACORDISMO_OFFICIAL_DIR') {
                if (val === '~') {
                    val = os.homedir();
                } else if (val.startsWith('~/') || val.startsWith('~\\')) {
                    val = path.join(os.homedir(), val.slice(2));
                }
                dirs.push(path.resolve(acordismoRoot, val));
            }
        }
    }

    return dirs;
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
        const configuredDirs = loadConfiguredSongDirs(acordismoRoot);

        modulesPromise = Promise.all([
            import(pathToFileURL(schemaPath).href),
            import(pathToFileURL(transposerPath).href),
        ]).then(([schemaMod, transposerMod]) => ({
            schemaMod,
            transposerMod,
            configuredDirs,
        }));
    }
    return modulesPromise;
}

function isFileInsideDirs(filePath, dirList) {
    const normalizedFile = path.resolve(filePath).toLowerCase();
    for (const dir of dirList) {
        const normalizedDir = path.resolve(dir).toLowerCase();
        if (
            normalizedFile.startsWith(normalizedDir + path.sep) ||
            normalizedFile === normalizedDir
        ) {
            return true;
        }
    }
    // Also match any path containing /0-guitar/ or \0-guitar\ as a convenience fallback
    return /[\\/]0-guitar[\\/]/i.test(normalizedFile);
}

function clearEditorDecorations(editor) {
    if (!editor) return;
    editor.setDecorations(parenBlockDecoration, []);
    editor.setDecorations(chordTokenDecoration, []);
    editor.setDecorations(directiveDecoration, []);
    editor.setDecorations(choirDecoration, []);
}

/**
 * Validates YAML frontmatter, checks chord consistency, and applies live editor decorations.
 * @param {vscode.TextDocument} document
 */
async function updateDiagnostics(document) {
    const activeEditor =
        vscode.window.activeTextEditor?.document === document
            ? vscode.window.activeTextEditor
            : null;

    if (document.languageId !== 'markdown') {
        if (statusBarItem) statusBarItem.hide();
        clearEditorDecorations(activeEditor);
        return;
    }

    let schemaMod;
    let transposerMod;
    let configuredDirs;
    try {
        ({ schemaMod, transposerMod, configuredDirs } = await loadSharedModules());
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

    // Check if strict project (Small Hotel Room / cancionesdejuan, case-insensitive)
    const isStrictProject = schemaMod.STRICT_PROJECT_NAMES.some(
        (name) => name.toLowerCase() === String(effectiveArtist || '').toLowerCase()
    );
    const isCuratedSong = isFileInsideDirs(document.fileName, configuredDirs);

    if (!isStrictProject && !isCuratedSong) {
        diagnosticCollection.set(document.uri, []);
        clearEditorDecorations(activeEditor);
        if (statusBarItem) statusBarItem.hide();
        return;
    }

    // 1. Frontmatter validation
    if (isStrictProject && (!parsed.hasFrontmatter || Object.keys(parsed.data).length === 0)) {
        const range = new vscode.Range(0, 0, 0, 3);
        diagnostics.push(
            new vscode.Diagnostic(
                range,
                `🚨 ACORDISMO LINT ERROR: Missing YAML frontmatter for strict project '${effectiveArtist}'.`,
                vscode.DiagnosticSeverity.Error
            )
        );
    } else if (parsed.hasFrontmatter && Object.keys(parsed.data).length > 0) {
        // Check missing required keys for strict projects
        if (isStrictProject) {
            const normalizedForStrict = {
                ...parsed.data,
                artist:
                    schemaMod.STRICT_PROJECT_NAMES.find(
                        (n) => n.toLowerCase() === String(effectiveArtist || '').toLowerCase()
                    ) || effectiveArtist,
            };
            const missing = schemaMod.getMissingKeys(normalizedForStrict, rawFileName);
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
        }

        // Check unknown/untreated frontmatter keys
        const treatedSet = new Set(schemaMod.TREATED_KEYS || []);
        for (const k of Object.keys(parsed.data)) {
            if (!treatedSet.has(k)) {
                const lineIdx = Math.max(0, (parsed.keyLines[k] ?? 1) - 1);
                const lineText = document.lineAt(lineIdx).text;
                const range = new vscode.Range(lineIdx, 0, lineIdx, lineText.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        `⚠️ ACORDISMO SCHEMA WARNING: Unrecognized frontmatter key '${k}'.`,
                        vscode.DiagnosticSeverity.Warning
                    )
                );
            }
        }

        // Check strict alphabetical order on any song that has frontmatter
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
                            isStrictProject
                                ? vscode.DiagnosticSeverity.Error
                                : vscode.DiagnosticSeverity.Warning
                        )
                    );
                    break;
                }
            }
        }
    }

    // 2. Scan body for (...) chords/directives and [...] choir blocks + build live decorations
    const sharpNotesFound = new Set();
    const flatNotesFound = new Set();
    const letterToNotes = new Map();
    let totalChordCount = 0;

    const parenRanges = [];
    const chordRanges = [];
    const directiveRanges = [];
    const choirRanges = [];

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
    const startZeroIdx = parsed.hasFrontmatter
        ? Math.max(0, (parsed.bodyStartLine || 1) - 1)
        : 0;

    for (let lineIdx = startZeroIdx; lineIdx < allLines.length; lineIdx++) {
        const lineStr = allLines[lineIdx];

        // Highlight [choir / backing vocal] blocks
        const choirRegex = /\[[^\]]+\]/g;
        let cMatch;
        while ((cMatch = choirRegex.exec(lineStr)) !== null) {
            choirRanges.push(
                new vscode.Range(
                    lineIdx,
                    cMatch.index,
                    lineIdx,
                    cMatch.index + cMatch[0].length
                )
            );
        }

        // Scan (...) blocks
        const parenRegex = /\(([^)]+)\)/g;
        let match;
        while ((match = parenRegex.exec(lineStr)) !== null) {
            const fullParen = match[0];
            const lowerParen = fullParen.toLowerCase();
            const blockStartCol = match.index;
            const blockEndCol = match.index + fullParen.length;

            // Check if directive like (capo 2), (drop 2), (bpm 120)
            if (
                schemaMod.SKIP_PAREN_PREFIXES.some((p) => lowerParen.startsWith(p)) ||
                lowerParen.includes('capo') ||
                lowerParen.includes('drop')
            ) {
                directiveRanges.push(
                    new vscode.Range(lineIdx, blockStartCol, lineIdx, blockEndCol)
                );
                continue;
            }

            parenRanges.push(new vscode.Range(lineIdx, blockStartCol, lineIdx, blockEndCol));
            // Highlight opening '(' and closing ')'
            chordRanges.push(
                new vscode.Range(lineIdx, blockStartCol, lineIdx, blockStartCol + 1),
                new vscode.Range(lineIdx, blockEndCol - 1, lineIdx, blockEndCol)
            );

            // Walk inner tokens and delimiters with exact column offsets
            const innerStr = match[1];
            const innerStartCol = blockStartCol + 1;
            let cursor = 0;
            let remaining = innerStr;

            while (remaining.length > 0) {
                const delimMatch = schemaMod.CHORD_GROUP_DELIMITER_REGEX.exec(remaining);
                const tokenStr =
                    delimMatch !== null ? remaining.slice(0, delimMatch.index) : remaining;
                const tokenStartCol = innerStartCol + cursor;
                const tokenEndCol = tokenStartCol + tokenStr.length;

                if (tokenStr.trim().length > 0) {
                    const chord = transposerMod.parseChordToken(tokenStr);
                    if (chord) {
                        totalChordCount++;
                        recordNote(chord.rootStr);
                        if (chord.bassStr) recordNote(chord.bassStr);
                        chordRanges.push(
                            new vscode.Range(lineIdx, tokenStartCol, lineIdx, tokenEndCol)
                        );
                    } else {
                        diagnostics.push(
                            new vscode.Diagnostic(
                                new vscode.Range(lineIdx, tokenStartCol, lineIdx, tokenEndCol),
                                `⚠️ ACORDISMO CHORD WARNING: Unrecognized chord or delimiter '${tokenStr.trim()}' inside parentheses.`,
                                vscode.DiagnosticSeverity.Warning
                            )
                        );
                    }
                }

                if (delimMatch !== null) {
                    const delimLen = delimMatch[0].length;
                    cursor += delimMatch.index + delimLen;
                    remaining = remaining.slice(delimMatch.index + delimLen);
                } else {
                    break;
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

    if (activeEditor) {
        activeEditor.setDecorations(parenBlockDecoration, parenRanges);
        activeEditor.setDecorations(chordTokenDecoration, chordRanges);
        activeEditor.setDecorations(directiveDecoration, directiveRanges);
        activeEditor.setDecorations(choirDecoration, choirRanges);
    }

    if (statusBarItem) {
        const modeLabel = isStrictProject ? 'Strict' : 'Curated';
        statusBarItem.text = `$(music) Acordismo [${modeLabel}: ${totalChordCount} chords]`;
        statusBarItem.tooltip = `Acordismo Linter v${__version__} — ${rawFileName}`;
        statusBarItem.show();
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
