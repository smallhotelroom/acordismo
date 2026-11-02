/**
 * @file tools/acordismo-linter/extension.js
 * @version 2.8.0
 * Zero-copy VS Code Linter & Live Chord Decorator for Acordismo.
 * Reads SYNTAX_PALETTE.dark directly from smallhotelroom.github.io/src/shared/songSchema.js.
 */
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const __version__ = '2.8.0';

const diagnosticCollection = vscode.languages.createDiagnosticCollection('acordismoLinter');
let statusBarItem = null;
let modulesPromise = null;

// Lazily initialized from songSchema.SYNTAX_PALETTE.dark
let decorations = null;

function ensureDecorations(palette) {
    if (decorations) return decorations;
    const p = palette?.dark || {
        parenBg: 'rgba(121, 192, 255, 0.06)',
        parenSymbol: '#d29922',
        chord: '#79c0ff',
        modifier: '#d29922',
        directive: '#b392f0',
        choir: '#7ee787',
    };

    decorations = {
        parenBlock: vscode.window.createTextEditorDecorationType({
            backgroundColor: p.parenBg,
            borderRadius: '3px',
        }),
        parenSymbol: vscode.window.createTextEditorDecorationType({
            color: p.parenSymbol,
            fontWeight: 'bold',
        }),
        chordToken: vscode.window.createTextEditorDecorationType({
            color: p.chord,
            fontWeight: 'bold',
        }),
        modifier: vscode.window.createTextEditorDecorationType({
            color: p.modifier,
            fontWeight: 'bold',
        }),
        directive: vscode.window.createTextEditorDecorationType({
            color: p.directive,
            fontWeight: 'bold',
        }),
        choir: vscode.window.createTextEditorDecorationType({
            color: p.choir,
            fontStyle: 'italic',
        }),
    };
    return decorations;
}

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
    return /[\\/]0-guitar[\\/]/i.test(normalizedFile);
}

function clearEditorDecorations(editor) {
    if (!editor || !decorations) return;
    editor.setDecorations(decorations.parenBlock, []);
    editor.setDecorations(decorations.parenSymbol, []);
    editor.setDecorations(decorations.chordToken, []);
    editor.setDecorations(decorations.modifier, []);
    editor.setDecorations(decorations.directive, []);
    editor.setDecorations(decorations.choir, []);
}

async function updateDiagnostics(document) {
    if (!document) return;

    const matchingEditors = vscode.window.visibleTextEditors.filter(
        (ed) => ed.document.uri.toString() === document.uri.toString()
    );

    if (document.languageId !== 'markdown') {
        if (
            statusBarItem &&
            vscode.window.activeTextEditor?.document.uri.toString() === document.uri.toString()
        ) {
            statusBarItem.hide();
        }
        matchingEditors.forEach(clearEditorDecorations);
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

    const dec = ensureDecorations(schemaMod.SYNTAX_PALETTE);
    const diagnostics = [];
    const text = document.getText();
    const rawFileName = path.basename(document.fileName, path.extname(document.fileName));

    let derivedArtist = null;
    if (rawFileName.includes(' - ')) {
        derivedArtist = rawFileName.split(' - ')[0].trim();
    }

    const parsed = schemaMod.parseFrontmatterFile(text);
    const effectiveArtist = parsed.data.artist || derivedArtist;

    const isStrictProject = schemaMod.STRICT_PROJECT_NAMES.some(
        (name) => name.toLowerCase() === String(effectiveArtist || '').toLowerCase()
    );
    const isCuratedSong = isFileInsideDirs(document.fileName, configuredDirs);

    if (!isStrictProject && !isCuratedSong) {
        diagnosticCollection.set(document.uri, []);
        matchingEditors.forEach(clearEditorDecorations);
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

    // 2. Scan body for (...) chords/modifiers/directives and [...] choir blocks
    const sharpNotesFound = new Set();
    const flatNotesFound = new Set();
    const letterToNotes = new Map();
    let totalChordCount = 0;

    const parenRanges = [];
    const parenSymbolRanges = [];
    const chordRanges = [];
    const modifierRanges = [];
    const directiveRanges = [];
    const choirRanges = [];

    const delimRegex = new RegExp(schemaMod.CHORD_GROUP_DELIMITER_REGEX.source);

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

        const parenRegex = /\(([^)]+)\)/g;
        let match;
        while ((match = parenRegex.exec(lineStr)) !== null) {
            const fullParen = match[0];
            const lowerParen = fullParen.toLowerCase();
            const blockStartCol = match.index;
            const blockEndCol = match.index + fullParen.length;

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
            // Gold '(' and ')' parenthesis symbols
            parenSymbolRanges.push(
                new vscode.Range(lineIdx, blockStartCol, lineIdx, blockStartCol + 1),
                new vscode.Range(lineIdx, blockEndCol - 1, lineIdx, blockEndCol)
            );

            const innerStr = match[1];
            const innerStartCol = blockStartCol + 1;
            let cursor = 0;
            let remaining = innerStr;

            while (remaining.length > 0) {
                const delimMatch = delimRegex.exec(remaining);
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
                    const delimStr = delimMatch[0];
                    const delimStartCol = tokenEndCol;
                    const delimEndCol = delimStartCol + delimStr.length;
                    if (delimStr.trim().length > 0) {
                        modifierRanges.push(
                            new vscode.Range(lineIdx, delimStartCol, lineIdx, delimEndCol)
                        );
                    }
                    cursor += delimMatch.index + delimStr.length;
                    remaining = remaining.slice(delimMatch.index + delimStr.length);
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

    for (const editor of matchingEditors) {
        editor.setDecorations(dec.parenBlock, parenRanges);
        editor.setDecorations(dec.parenSymbol, parenSymbolRanges);
        editor.setDecorations(dec.chordToken, chordRanges);
        editor.setDecorations(dec.modifier, modifierRanges);
        editor.setDecorations(dec.directive, directiveRanges);
        editor.setDecorations(dec.choir, choirRanges);
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
        vscode.workspace.onDidOpenTextDocument((doc) => {
            updateDiagnostics(doc);
        }),
        vscode.workspace.onDidChangeTextDocument((event) => {
            updateDiagnostics(event.document);
        }),
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                updateDiagnostics(editor.document);
            } else if (statusBarItem) {
                statusBarItem.hide();
            }
        }),
        vscode.window.onDidChangeVisibleTextEditors((editors) => {
            editors.forEach((ed) => updateDiagnostics(ed.document));
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
