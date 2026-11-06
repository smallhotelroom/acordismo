#!/usr/bin/env node
/**
 * @file scripts/build-pdf.mjs
 * @version 2.0.0
 * Builds printable LaTeX/PDF songbooks from Acordismo SQLite databases or markdown sources.
 * - Default mode: High-contrast B/W grayscale (`SYNTAX_PALETTE.pdfBw` from songSchema.js)
 *   where chords are pure black and parentheses/modifiers are charcoal grey (#6e6e6e).
 * - Color mode (`--color` / `--colours`): Uses `SYNTAX_PALETTE.light` from songSchema.js
 *   (purple parentheses/modifiers, royal blue chords, amber directives, green choir).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import initSqlJs from 'sql.js';

export const __version__ = '2.0.0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const EXTERNAL_TRANSPOSER_PATH = path.resolve(
    ROOT_DIR,
    '../smallhotelroom.github.io/src/shared/chordTransposer.js'
);

async function loadSharedTransposer() {
    if (!fs.existsSync(EXTERNAL_TRANSPOSER_PATH)) {
        throw new Error(
            `Master chordTransposer.js not found at ${EXTERNAL_TRANSPOSER_PATH}.`
        );
    }
    return await import(pathToFileURL(EXTERNAL_TRANSPOSER_PATH).href);
}

/**
 * Escapes special LaTeX characters in plain text/chords while preserving spaces via ~ in monospace.
 */
export function escapeLatex(str, preserveSpaces = false) {
    let out = String(str || '')
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/([#$%&_{}])/g, '\\$1')
        .replace(/\^/g, '\\textasciicircum{}')
        .replace(/~/g, '\\textasciitilde{}');

    if (preserveSpaces) {
        out = out.replace(/ /g, '\\ ');
    }
    return out;
}

/**
 * Formats [choir] blocks inside lyric text into italic `\textcolor{acChoir}{\textit{...}}`.
 */
function formatLyricSegmentLatex(text) {
    if (!text) return '';
    if (!text.includes('[')) {
        return escapeLatex(text, true);
    }
    const parts = [];
    const regex = /\[[^\]]+\]/g;
    let lastIdx = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIdx) {
            parts.push(escapeLatex(text.slice(lastIdx, match.index), true));
        }
        parts.push(
            `\\textcolor{acChoir}{\\textit{${escapeLatex(match[0], true)}}}`
        );
        lastIdx = match.index + match[0].length;
    }
    if (lastIdx < text.length) {
        parts.push(escapeLatex(text.slice(lastIdx), true));
    }
    return parts.join('');
}

/**
 * Converts a single song's contents into syntax-highlighted LaTeX lines using the
 * shared grammar and LaTeX color definitions (`acParen`, `acChord`, `acMod`, `acDir`, `acChoir`).
 */
export function formatSongContentsToLatex(
    contents,
    transposerMod,
    { semitones = 0, frontmatterCapo = 0, songKeyHint = null } = {}
) {
    const {
        CHORD_GROUP_DELIMITER_REGEX,
        DIRECTIVE_PAREN_REGEX,
        deduceSongUseFlats,
        isValidParenChordGroup,
        transposeChordToken,
    } = transposerMod;

    const useFlats = deduceSongUseFlats(contents, semitones, songKeyHint);
    const lines = String(contents || '').replace(/\r\n/g, '\n').split('\n');
    const latexLines = [];

    if (frontmatterCapo) {
        const dirText =
            frontmatterCapo < 0
                ? `(chords for drop ${-frontmatterCapo} semitones)`
                : `(chords for capo on ${frontmatterCapo})`;
        latexLines.push(
            `\\textbf{\\textcolor{acDir}{${escapeLatex(dirText, true)}}}`
        );
        latexLines.push('');
    }

    for (const lineText of lines) {
        if (!lineText.trim()) {
            latexLines.push('\\vspace{0.55em}');
            continue;
        }

        const re1 = /\((.+?)\)/g;
        let match;
        let outerLastIndex = 0;
        let lineOut = '';

        while ((match = re1.exec(lineText)) !== null) {
            const chordGroup = match[1];
            const isDirective = DIRECTIVE_PAREN_REGEX.test(chordGroup);
            const isValidChords = !isDirective && isValidParenChordGroup(chordGroup);

            if (!isDirective && !isValidChords) {
                continue;
            }

            lineOut += formatLyricSegmentLatex(
                lineText.slice(outerLastIndex, re1.lastIndex - match[0].length)
            );

            if (isDirective) {
                lineOut += `\\textbf{\\textcolor{acDir}{(${escapeLatex(chordGroup, true)})}}`;
            } else {
                let remaining = chordGroup;
                let innerLatex = '';

                while (remaining.length > 0) {
                    const delim = CHORD_GROUP_DELIMITER_REGEX.exec(remaining);
                    if (delim !== null) {
                        const treatable = remaining.slice(0, delim.index);
                        const delimStr = delim[0];
                        remaining = remaining.slice(delim.index + delimStr.length);

                        if (treatable.length > 0) {
                            const transposed = transposeChordToken(
                                treatable,
                                semitones,
                                useFlats
                            );
                            innerLatex += `\\textcolor{acChord}{${escapeLatex(transposed, true)}}`;
                        }
                        innerLatex += `\\textcolor{acMod}{${escapeLatex(delimStr, true)}}`;
                    } else {
                        const transposed = transposeChordToken(
                            remaining,
                            semitones,
                            useFlats
                        );
                        innerLatex += `\\textcolor{acChord}{${escapeLatex(transposed, true)}}`;
                        break;
                    }
                }

                lineOut += `\\textbf{\\textcolor{acParen}{(}${innerLatex}\\textcolor{acParen}{)}}`;
            }

            outerLastIndex = re1.lastIndex;
        }

        lineOut += formatLyricSegmentLatex(
            lineText.slice(outerLastIndex, lineText.length)
        );
        latexLines.push(`${lineOut}\\\\`);
    }

    return latexLines.join('\n');
}

/**
 * Generates the LaTeX `\definecolor` block directly from `SYNTAX_PALETTE.pdfBw` (default)
 * or `SYNTAX_PALETTE.light` (when `--color` is passed).
 */
export function buildLatexPalettePreamble(SYNTAX_PALETTE, useColor = false) {
    const p = useColor ? SYNTAX_PALETTE.light : SYNTAX_PALETTE.pdfBw;
    const stripHash = (hex) => String(hex || '#000000').replace(/^#/, '').toUpperCase();

    return `
\\usepackage{xcolor}
\\definecolor{acParen}{HTML}{${stripHash(p.parenSymbol)}}
\\definecolor{acChord}{HTML}{${stripHash(p.chord)}}
\\definecolor{acMod}{HTML}{${stripHash(p.modifier)}}
\\definecolor{acDir}{HTML}{${stripHash(p.directive)}}
\\definecolor{acChoir}{HTML}{${stripHash(p.choir)}}
`.trim();
}

async function main() {
    const args = process.argv.slice(2);
    const useColor = args.includes('--color') || args.includes('--colours') || args.includes('-c');
    const dbArg = args.find((a) => !a.startsWith('-')) || 'public/songs.db';
    const dbPath = path.resolve(ROOT_DIR, dbArg);

    if (!fs.existsSync(dbPath)) {
        throw new Error(`Database not found at ${dbPath}. Run 'npm run db:build' first.`);
    }

    const transposerMod = await loadSharedTransposer();
    const { SYNTAX_PALETTE } = transposerMod;

    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync(dbPath));

    const stmt = db.prepare(`
        SELECT songs.*, bands.name AS band_name
        FROM songs
        INNER JOIN bands ON songs.band_id = bands.id
        ORDER BY bands.name ASC, songs.name ASC;
    `);

    const songs = [];
    while (stmt.step()) {
        songs.push(stmt.getAsObject());
    }
    stmt.free();
    db.close();

    const modeSuffix = useColor ? 'color' : 'bw';
    const outDir = path.join(ROOT_DIR, 'dist-pdfs');
    fs.mkdirSync(outDir, { recursive: true });

    const palettePreamble = buildLatexPalettePreamble(SYNTAX_PALETTE, useColor);

    const songSections = songs.map((s) => {
        const bodyLatex = formatSongContentsToLatex(s.contents, transposerMod, {
            semitones: 0,
            frontmatterCapo: s.capo || 0,
            songKeyHint: s.key || null,
        });

        return `
\\section*{${escapeLatex(s.band_name)} --- ${escapeLatex(s.name)}}
\\addcontentsline{toc}{section}{${escapeLatex(s.band_name)} --- ${escapeLatex(s.name)}}
{\\ttfamily\\small\\noindent
${bodyLatex}
}
\\newpage
`.trim();
    });

    const texDocument = `
\\documentclass[10pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[margin=1.6cm]{geometry}
\\usepackage{hyperref}
${palettePreamble}

\\setlength{\\parindent}{0pt}
\\pagenumbering{gobble}

\\begin{document}
\\tableofcontents
\\newpage
${songSections.join('\n\n')}
\\end{document}
`.trim();

    const texPath = path.join(outDir, `acordismo-songbook-${modeSuffix}.tex`);
    fs.writeFileSync(texPath, texDocument, 'utf8');
    console.log(
        `✅ Wrote LaTeX source (${useColor ? 'COLOR' : 'B/W'} palette): ${texPath} (${songs.length} songs)`
    );

    const pdflatexCheck = spawnSync('pdflatex', ['--version'], { stdio: 'ignore' });
    if (!pdflatexCheck.error && pdflatexCheck.status === 0) {
        console.log(`🖨️  Compiling PDF via pdflatex...`);
        // Run twice so Table of Contents resolves
        for (let pass = 1; pass <= 2; pass++) {
            spawnSync(
                'pdflatex',
                ['-interaction=nonstopmode', `-output-directory=${outDir}`, texPath],
                { stdio: 'ignore' }
            );
        }
        console.log(
            `🎉 Generated PDF: ${path.join(outDir, `acordismo-songbook-${modeSuffix}.pdf`)}`
        );
    } else {
        console.log(
            `ℹ️  'pdflatex' not found in PATH; .tex file is ready at ${texPath}.`
        );
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main().catch((err) => {
        console.error('❌ PDF build failed:', err.message || err);
        process.exit(1);
    });
}
