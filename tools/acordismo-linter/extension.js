/**
 * @file tools/acordismo-linter/extension.js
 * @version 2.0.0
 */
const vscode = require('vscode');
const path = require('path');

const __version__ = '2.0.0';

const STRICT_PROJECT_NAMES = ['Small Hotel Room', 'cancionesdejuan'];
const STRICT_PROJECT_KEYS = [
    'album',
    'author',
    'bpm',
    'isrc',
    'lang',
    'license',
    'musicians',
    'spotify',
    'track',
    'url',
];

const SKIP_PAREN_PREFIXES = [
    '(bpm',
    '(tempo',
    '(key',
    '(highest',
    '(falsetto',
    '(all',
    '(chords for',
];

const CHORD_GROUP_DELIMITER_REGEX =
    /  |_|!|\.\.\.|\.\.|: |\*|high|open|bass|riff|palm mute|notes|sus4/;

const NOTE_TO_SEMITONE = {
    C: 0,
    'B#': 0,
    'C#': 1,
    Db: 1,
    D: 2,
    'D#': 3,
    Eb: 3,
    E: 4,
    Fb: 4,
    F: 5,
    'E#': 5,
    'F#': 6,
    Gb: 6,
    G: 7,
    'G#': 8,
    Ab: 8,
    A: 9,
    'A#': 10,
    Bb: 10,
    B: 11,
    Cb: 11,
};

const diagnosticCollection = vscode.languages.createDiagnosticCollection('acordismoLinter');

/**
 * Indentation- and list-aware YAML frontmatter parser with exact 0-based line numbers for VS Code.
 */
function parseFrontmatterWithLines(rawText) {
    const normalized = rawText.replace(/\r\n/g, '\n');
    if (!normalized.startsWith('---\n')) {
        return { hasFrontmatter: false, data: {}, keyLines: {}, bodyStartLine: 0, content: normalized };
    }
    const endIdx = normalized.indexOf('\n---\n', 4);
    if (endIdx === -1) {
        return { hasFrontmatter: false, data: {}, keyLines: {}, bodyStartLine: 0, content: normalized };
    }

    const yamlBlock = normalized.slice(4, endIdx);
    const yamlLines = yamlBlock.split('\n');
    const bodyStartLine = yamlLines.length + 2;
    const content = normalized.slice(endIdx + 5);

    const data = {};
    const keyLines = {};

    const parseScalar = (rawVal) => {
        const val = rawVal.trim();
        if (val === '') return '';
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) {
            return val.slice(1, -1);
        }
        if (/^-?\d+$/.test(val)) return parseInt(val, 10);
        if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val, 10);
        return val;
    };

    let currentTopKey = null;
    let currentListObj = null;

    for (let idx = 0; idx < yamlLines.length; idx++) {
        const line = yamlLines[idx];
        const zeroBasedLineNumber = idx + 1; // Line 0 is '---'
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const isIndented = /^\s/.test(line);
        const isListItem = trimmed.startsWith('- ') || trimmed === '-';

        if (!isIndented && !isListItem) {
            const colonIdx = line.indexOf(':');
            if (colonIdx !== -1) {
                const key = line.slice(0, colonIdx).trim();
                const rawVal = line.slice(colonIdx + 1).trim();
                currentTopKey = key;
                currentListObj = null;
                keyLines[key] = zeroBasedLineNumber;

                if (rawVal === '') {
                    data[key] = [];
                } else {
                    data[key] = parseScalar(rawVal);
                }
            }
        } else if (currentTopKey) {
            if (isListItem) {
                if (!Array.isArray(data[currentTopKey])) {
                    data[currentTopKey] = [];
                }
                const afterDash = trimmed.slice(1).trim();
                const colonIdx = afterDash.indexOf(':');
                if (
                    colonIdx !== -1 &&
                    !afterDash.startsWith('"') &&
                    !afterDash.startsWith("'")
                ) {
                    const subKey = afterDash.slice(0, colonIdx).trim();
                    const subVal = parseScalar(afterDash.slice(colonIdx + 1));
                    currentListObj = { [subKey]: subVal };
                    data[currentTopKey].push(currentListObj);
                } else if (afterDash !== '') {
                    currentListObj = null;
                    data[currentTopKey].push(parseScalar(afterDash));
                } else {
                    currentListObj = {};
                    data[currentTopKey].push(currentListObj);
                }
            } else if (currentListObj && trimmed.includes(':')) {
                const colonIdx = trimmed.indexOf(':');
                const subKey = trimmed.slice(0, colonIdx).trim();
                const subVal = parseScalar(trimmed.slice(colonIdx + 1));
                currentListObj[subKey] = subVal;
            }
        }
    }

    return { hasFrontmatter: true, data, keyLines, bodyStartLine, content };
}

function parseChordToken(token) {
    if (!token || typeof token !== 'string') return null;
    const trimmed = token.trim();
    if (!trimmed) return null;

    const match = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/.exec(trimmed);
    if (!match) return null;

    const [, rootStr, rawQuality = '', bassStr = null] = match;
    if (NOTE_TO_SEMITONE[rootStr] === undefined) return null;

    if (
        rawQuality &&
        !/^(?:m|maj|min|dim|aug|sus|add|[0-9]|[#b+-]|M|\(|\))*$/i.test(rawQuality)
    ) {
        return null;
    }

    if (bassStr && NOTE_TO_SEMITONE[bassStr] === undefined) return null;

    return { rootStr, quality: rawQuality, bassStr };
}

/**
 * Validates both YAML frontmatter and song chord consistency (mixed #/b or letter collisions).
 * @param {vscode.TextDocument} document
 */
function updateDiagnostics(document) {
    if (document.languageId !== 'markdown') {
        return;
    }

    const diagnostics = [];
    const text = document.getText();
    const rawFileName = path.basename(document.fileName, path.extname(document.fileName));

    let derivedArtist = null;
    if (rawFileName.includes(' - ')) {
        derivedArtist = rawFileName.split(' - ')[0].trim();
    }

    const parsed = parseFrontmatterWithLines(text);
    const effectiveArtist = parsed.data.artist || derivedArtist;

    // Boundary check: only lint known strict projects or files inside a songs/chords folder
    const isStrictProject = STRICT_PROJECT_NAMES.includes(effectiveArtist);
    if (!isStrictProject) {
        diagnosticCollection.set(document.uri, []);
        return;
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

    // 1. Check missing required keys
    const missing = STRICT_PROJECT_KEYS.filter(
        (reqKey) => parsed.data[reqKey] === undefined || parsed.data[reqKey] === null
    );
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

    // 2. Check strict alphabetical order and squiggle the exact offending key line
    const keys = Object.keys(parsed.data);
    const sortedKeys = [...keys].sort();
    for (let i = 0; i < keys.length; i++) {
        if (keys[i] !== sortedKeys[i]) {
            const offendingKey = keys[i];
            const expectedKey = sortedKeys[i];
            const lineIdx = parsed.keyLines[offendingKey] ?? 0;
            const lineText = document.lineAt(lineIdx).text;
            const range = new vscode.Range(lineIdx, 0, lineIdx, lineText.length);

            diagnostics.push(
                new vscode.Diagnostic(
                    range,
                    `🚨 ACORDISMO LINT ERROR: Key '${offendingKey}' is out of alphabetical order (expected '${expectedKey}' at position ${i + 1}).\nExpected order: [${sortedKeys.join(', ')}]`,
                    vscode.DiagnosticSeverity.Error
                )
            );
            break;
        }
    }

    // 3. Check song chord palette consistency (no mixed #/b roots, warn on duplicate letter collisions)
    const sharpNotesFound = new Set();
    const flatNotesFound = new Set();
    const letterToNotes = new Map(); // 'B' -> Set('B', 'Bb')

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
    for (let lineIdx = parsed.bodyStartLine - 1; lineIdx < allLines.length; lineIdx++) {
        if (lineIdx < 0) continue;
        const lineStr = allLines[lineIdx];
        const parenRegex = /\(([^)]+)\)/g;
        let match;
        while ((match = parenRegex.exec(lineStr)) !== null) {
            const fullParen = match[0].toLowerCase();
            if (SKIP_PAREN_PREFIXES.some((p) => fullParen.startsWith(p))) continue;
            if (fullParen.includes('capo') || fullParen.includes('drop')) continue;

            const tokens = match[1].split(CHORD_GROUP_DELIMITER_REGEX);
            for (const tok of tokens) {
                const chord = parseChordToken(tok);
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
    if (vscode.window.activeTextEditor) {
        updateDiagnostics(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            updateDiagnostics(event.document);
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                updateDiagnostics(editor.document);
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
