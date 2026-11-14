#!/usr/bin/env node
/**
 * @file scripts/build-pdf.mjs
 * @version 3.1.0
 * Builds printable LaTeX/PDF songbooks from Small Hotel Room SQLite databases.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import * as transposerMod from '../src/shared/chordTransposer.js';
import {
    FALLBACK_SHR_CONFIG,
    parseShrConfigYaml,
} from '../src/shared/shrConfig.js';
import {
    isCrawlerChordLine,
    isStandaloneChordLine,
    stripOuterPunctuation,
} from '../src/shared/crawlerTransposer.js';
import { parseSongSections } from '../src/shared/songSections.js';

export const __version__ = '3.1.0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const LATEX_ESCAPE_MAP = {
    '\\': '\\textbackslash{}',
    '{': '\\{',
    '}': '\\}',
    '#': '\\#',
    $: '\\$',
    '%': '\\%',
    '&': '\\&',
    _: '\\_',
    '^': '\\textasciicircum{}',
    '~': '\\textasciitilde{}',
    '-': '-\\kern0pt{}',
};

function loadPdfConfig() {
    const configPath = path.join(ROOT_DIR, 'shr-config.yaml');
    if (fs.existsSync(configPath)) {
        return parseShrConfigYaml(fs.readFileSync(configPath, 'utf8')).pdf;
    }
    return FALLBACK_SHR_CONFIG.pdf;
}

export function escapeLatex(str, preserveSpaces = false) {
    const escaped = String(str || '')
        .replace(/\t/g, '    ')
        .replace(/[\\{}#$%&_^~-]/g, (ch) => LATEX_ESCAPE_MAP[ch]);

    return preserveSpaces ? escaped.replace(/ /g, '\\hspace*{0.6em}') : escaped;
}

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

function formatCrawlerChordLineLatex(lineText, mod, semitones, useFlats) {
    const { parseChordToken, transposeChordToken } = mod;
    const tokenRegex = /(\S+)|(\s+)/g;
    let match;
    let out = '';

    while ((match = tokenRegex.exec(lineText)) !== null) {
        const [, rawWord, spaceRun] = match;
        if (spaceRun) {
            out += escapeLatex(spaceRun, true);
        } else if (rawWord) {
            const { prefix, core, suffix } = stripOuterPunctuation(rawWord);
            if (core && parseChordToken(core) !== null) {
                if (prefix) out += escapeLatex(prefix, true);
                const transposed = transposeChordToken(core, semitones, useFlats);
                out += `\\textbf{\\textcolor{acChord}{${escapeLatex(transposed, true)}}}`;
                if (suffix) out += escapeLatex(suffix, true);
            } else {
                out += escapeLatex(rawWord, true);
            }
        }
    }
    return out;
}

export function formatSongContentsToLatex(
    contents,
    mod = transposerMod,
    {
        semitones = 0,
        frontmatterCapo = 0,
        songKeyHint = null,
        originId = 0,
        isRawSection = false,
    } = {}
) {
    const {
        CHORD_GROUP_DELIMITER_REGEX,
        DIRECTIVE_PAREN_REGEX,
        deduceSongUseFlats,
        isValidParenChordGroup,
        transposeChordToken,
    } = mod;

    const targetText = isRawSection ? contents : parseSongSections(contents).mainContent;
    const trimmedContents = String(targetText || '')
        .replace(/\r\n/g, '\n')
        .replace(/[\s\n]+$/, '');
    const useFlats = deduceSongUseFlats(trimmedContents, semitones, songKeyHint);
    const isCrawlerOrigin = Number(originId || 0) > 0;
    const lines = trimmedContents.split('\n');
    const latexLines = [];

    if (frontmatterCapo) {
        const dirText =
            frontmatterCapo < 0
                ? `(chords for drop ${-frontmatterCapo} semitones)`
                : `(chords for capo on ${frontmatterCapo})`;
        latexLines.push(
            `\\noindent\\strut\\textbf{\\textcolor{acDir}{${escapeLatex(dirText, true)}}}\\par`
        );
        latexLines.push(`\\noindent\\strut\\par`);
    }

    for (const lineText of lines) {
        if (lineText.trim().length === 0) {
            latexLines.push(`\\noindent\\strut\\par`);
            continue;
        }

        let lineOut = '';

        if (isCrawlerOrigin) {
            if (isCrawlerChordLine(lineText)) {
                lineOut = formatCrawlerChordLineLatex(
                    lineText,
                    mod,
                    semitones,
                    useFlats
                );
            } else {
                lineOut = formatLyricSegmentLatex(lineText);
            }
        } else if (!lineText.includes('(') && isStandaloneChordLine(lineText)) {
            lineOut = formatCrawlerChordLineLatex(
                lineText,
                mod,
                semitones,
                useFlats
            );
        } else {
            const re1 = /\((.+?)\)/g;
            let match;
            let outerLastIndex = 0;

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
        }

        latexLines.push(`\\noindent\\strut{}${lineOut}\\par`);
    }

    return latexLines.join('\n');
}

export function buildLatexPalettePreamble(SYNTAX_PALETTE, useColor = true) {
    const p = useColor ? SYNTAX_PALETTE.light : SYNTAX_PALETTE.pdfBw || SYNTAX_PALETTE.light;
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

function prepareCoverLogoPng(outDir) {
    const candidates = [
        path.join(ROOT_DIR, 'public', 'favicon.svg'),
        path.join(ROOT_DIR, 'src', 'assets', 'shr-logo.svg'),
        path.join(ROOT_DIR, 'shr-logo.svg'),
    ];
    const svgPath = candidates.find((p) => fs.existsSync(p));
    if (!svgPath) return null;

    const outPng = path.join(outDir, 'shr-cover-logo.png');
    const check = spawnSync('rsvg-convert', ['--version'], { stdio: 'ignore' });
    if (!check.error && check.status === 0) {
        const rawSvg = fs
            .readFileSync(svgPath, 'utf8')
            .replace(/<sodipodi:[^>]*\/>/gi, '')
            .replace(/<sodipodi:[\s\S]*?<\/sodipodi:[^>]+>/gi, '')
            .replace(/<inkscape:[^>]*\/>/gi, '')
            .replace(/<inkscape:[\s\S]*?<\/inkscape:[^>]+>/gi, '')
            .replace(/\s+(?:sodipodi|inkscape):[a-zA-Z0-9_-]+="[^"]*"/gi, '');
        const tmpSvg = path.join(outDir, '_tmp_cover_logo.svg');
        fs.writeFileSync(tmpSvg, rawSvg, 'utf8');
        const res = spawnSync('rsvg-convert', ['-w', '420', '-h', '420', tmpSvg, '-o', outPng]);
        if (fs.existsSync(tmpSvg)) fs.unlinkSync(tmpSvg);
        if (res.status === 0 && fs.existsSync(outPng)) {
            return 'shr-cover-logo.png';
        }
    }
    return null;
}

async function main() {
    const pdfCfg = loadPdfConfig();
    const args = process.argv.slice(2);

    const forceBw = args.includes('--bw') || args.includes('--grayscale') || args.includes('--b/w');
    const forceColor = args.includes('--color') || args.includes('--colours') || args.includes('-c');
    const useColor = forceBw
        ? false
        : forceColor
          ? true
          : String(pdfCfg.default_palette || 'color').toLowerCase() !== 'bw';

    const forceNoTranslations =
        args.includes('--no-translations') || args.includes('--no-translation');
    const forceTranslations =
        args.includes('--translations') || args.includes('--translation');
    const includeTranslations = forceNoTranslations
        ? false
        : forceTranslations
          ? true
          : Boolean(pdfCfg.include_translations);

    const dbArg = args.find((a) => !a.startsWith('-')) || pdfCfg.default_db || 'public/songs.db';
    const dbPath = path.resolve(ROOT_DIR, dbArg);

    if (!fs.existsSync(dbPath)) {
        throw new Error(`Database not found at ${dbPath}. Run 'npm run db:build' first.`);
    }

    const { SYNTAX_PALETTE } = transposerMod;

    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync(dbPath));

    const stmt = db.prepare(`
        SELECT songs.*, bands.name AS band_name
        FROM songs
        INNER JOIN bands ON songs.band_id = bands.id
        WHERE COALESCE(songs.has_chords, 1) = 1
        ORDER BY LOWER(bands.name) ASC, LOWER(songs.name) ASC;
    `);

    const songs = [];
    const bandSet = new Set();
    while (stmt.step()) {
        const row = stmt.getAsObject();
        songs.push(row);
        bandSet.add(row.band_name);
    }
    stmt.free();
    db.close();

    const modeSuffix = useColor ? 'color' : 'bw';
    const outDir = path.resolve(ROOT_DIR, pdfCfg.output_dir || 'dist-pdfs');
    fs.mkdirSync(outDir, { recursive: true });

    const coverLogoFile = prepareCoverLogoPng(outDir);
    const palettePreamble = buildLatexPalettePreamble(SYNTAX_PALETTE, useColor);

    let translationCount = 0;
    const songSections = songs.map((s, idx) => {
        const labelId = `song:${idx + 1}`;
        const titleStr = `${escapeLatex(s.band_name)} - ${escapeLatex(s.name)}`;
        const parsed = parseSongSections(s.contents, s.lang || 'Original');

        const bodyLatex = formatSongContentsToLatex(parsed.mainContent, transposerMod, {
            semitones: 0,
            frontmatterCapo: s.capo || 0,
            songKeyHint: s.key || null,
            originId: s.origin_id || 0,
            isRawSection: true,
        });

        const blocks = [
            `
\\phantomsection
\\label{${labelId}}
\\addcontentsline{toc}{section}{${titleStr}}
{\\Large\\bfseries\\noindent ${titleStr}\\par}
\\vspace{0.6em}
{\\ttfamily\\small\\linespread{1.05}\\selectfont
${bodyLatex}
}
`.trim(),
        ];

        if (includeTranslations && parsed.translations.length > 0) {
            for (const tr of parsed.translations) {
                translationCount++;
                const trTitleStr = `${titleStr} (${escapeLatex(tr.lang)})`;
                const trBodyLatex = formatSongContentsToLatex(
                    tr.content,
                    transposerMod,
                    {
                        semitones: 0,
                        frontmatterCapo: 0,
                        songKeyHint: s.key || null,
                        originId: s.origin_id || 0,
                        isRawSection: true,
                    }
                );

                blocks.push(
                    `
\\vspace{1.4em}
\\needspace{5\\baselineskip}
{\\large\\bfseries\\noindent ${trTitleStr}\\par}
\\vspace{0.5em}
{\\ttfamily\\small\\linespread{1.05}\\selectfont
${trBodyLatex}
}
`.trim()
                );
            }
        }

        blocks.push('\\clearpage');
        return blocks.join('\n\n');
    });

    const songsByTitle = [...songs]
        .map((s, idx) => ({ ...s, labelId: `song:${idx + 1}` }))
        .sort(
            (a, b) =>
                a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
                a.band_name.localeCompare(b.band_name, undefined, { sensitivity: 'base' })
        );

    const songIndexEntries = songsByTitle.map((s) => {
        const songOnlyText = escapeLatex(s.name);
        return `\\noindent\\hyperref[${s.labelId}]{${songOnlyText}}\\hspace{0.4em}\\pageref{${s.labelId}}\\par`;
    });

    const fontSize = pdfCfg.font_size || '10pt';
    const paperSize = pdfCfg.paper_size || 'a4paper';
    const margin = pdfCfg.margin || '1.6cm';
    const todayStr = new Date().toISOString().slice(0, 10);

    const logoLatexBlock = coverLogoFile
        ? `\\includegraphics[width=4.6cm]{${coverLogoFile}}\\par\n    \\vspace{1.2cm}`
        : '';

    const texDocument = `
\\documentclass[${fontSize},${paperSize}]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[margin=${margin}]{geometry}
\\usepackage{graphicx}
\\usepackage{multicol}
\\usepackage{needspace}
\\usepackage{hyperref}
${palettePreamble}

\\hypersetup{
    colorlinks=true,
    linkcolor=black,
    urlcolor=acChord
}

\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{0pt}
\\setlength{\\columnsep}{1.2cm}

\\begin{document}

% --- COVER PAGE (Vertically & Horizontally Centered) ---
\\begin{titlepage}
    \\centering
    \\vspace*{\\fill}
    ${logoLatexBlock}
    {\\Huge\\bfseries Small Hotel Room\\par}
    \\vspace{0.5cm}
    {\\Large Songbook \\& Chord Reference\\par}
    \\vspace{1.2cm}
    {\\large ${songs.length} Songs \\cdot\\ ${bandSet.size} Bands\\par}
    \\vspace*{\\fill}
    {\\normalsize\\ttfamily ${escapeLatex(todayStr)}\\par}
\\end{titlepage}

\\pagenumbering{arabic}

% --- INITIAL TABLE OF CONTENTS (BAND - SONG) ---
\\tableofcontents
\\clearpage

% --- SONG SHEETS ---
${songSections.join('\n\n')}

% --- BACK-OF-BOOK 2-COLUMN ALPHABETICAL SONG INDEX (SONG NAMES ONLY) ---
\\phantomsection
\\addcontentsline{toc}{section}{Song Index}
{\\Large\\bfseries\\noindent Song Index\\par}
\\vspace{0.8em}
\\begin{multicols}{2}
\\raggedright
${songIndexEntries.join('\n')}
\\end{multicols}

\\end{document}
`.trim();

    const texPath = path.join(outDir, `shr-songbook-${modeSuffix}.tex`);
    fs.writeFileSync(texPath, texDocument, 'utf8');
    console.log(
        `✅ Wrote LaTeX source (${useColor ? 'COLOR' : 'B/W'} palette, translations: ${includeTranslations ? `ON [${translationCount}]` : 'OFF'}): ${texPath} (${songs.length} songs)`
    );

    const pdflatexCheck = spawnSync('pdflatex', ['--version'], { stdio: 'ignore' });
    if (!pdflatexCheck.error && pdflatexCheck.status === 0) {
        console.log(`🖨️  Compiling PDF via pdflatex (2 passes for TOC & Song Index)...`);
        for (let pass = 1; pass <= 2; pass++) {
            spawnSync(
                'pdflatex',
                ['-interaction=nonstopmode', `-output-directory=${outDir}`, texPath],
                { cwd: outDir, stdio: 'ignore' }
            );
        }
        console.log(
            `🎉 Generated PDF: ${path.join(outDir, `shr-songbook-${modeSuffix}.pdf`)}`
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
