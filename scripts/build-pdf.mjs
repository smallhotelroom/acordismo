#!/usr/bin/env node
/**
 * @file scripts/build-pdf.mjs
 * @version 1.3.0
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import initSqlJs from 'sql.js';
import { loadMasterSongSchema } from './build-db.mjs';

export const __version__ = '1.3.0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_PDF_OUT_DIR = path.join(ROOT_DIR, 'dist-pdfs');

const EXTERNAL_TRANSPOSER_PATH = path.resolve(
    ROOT_DIR,
    '../smallhotelroom.github.io/src/shared/chordTransposer.js'
);

async function loadMasterChordTransposer() {
    if (!fs.existsSync(EXTERNAL_TRANSPOSER_PATH)) {
        throw new Error(
            `[Draconian Check] Master chordTransposer.js not found at ${EXTERNAL_TRANSPOSER_PATH}.`
        );
    }
    return await import(pathToFileURL(EXTERNAL_TRANSPOSER_PATH).href);
}

/**
 * Escapes characters that are active/special inside LaTeX's alltt environment (#, %, &, _)
 * so chords like (F#m) and Markdown headers like "## Español" render cleanly with exit code 0.
 */
function escapeLatexAlltt(text) {
    return String(text || '')
        .replace(/#/g, '\\#')
        .replace(/%/g, '\\%')
        .replace(/&/g, '\\&')
        .replace(/_/g, '\\_');
}

function escapeLatexHeader(text) {
    return String(text || '')
        .replace(/#/g, '\\#')
        .replace(/%/g, '\\%')
        .replace(/&/g, '\\&')
        .replace(/_/g, '\\_');
}

function parseArgs(argv) {
    const args = {
        input: null,
        db: 'public/songs.db',
        playlist: null,
        output: 'dist-pdfs/Songbook.pdf',
        template: 'templates/english.tex',
        manifest: '',
        transpose: 0,
        capoDropCorrection: false,
        keepTex: false,
    };

    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--input' && argv[i + 1]) args.input = argv[++i];
        else if (arg === '--db' && argv[i + 1]) args.db = argv[++i];
        else if (arg === '--playlist' && argv[i + 1]) args.playlist = argv[++i];
        else if (arg === '--output' && argv[i + 1]) args.output = argv[++i];
        else if (arg === '--template' && argv[i + 1]) args.template = argv[++i];
        else if (arg === '--manifest' && argv[i + 1]) args.manifest = argv[++i];
        else if (arg === '--transpose' && argv[i + 1]) args.transpose = parseInt(argv[++i], 10);
        else if (arg === '--capoDropCorrection' || arg === '--capo-drop-correction') {
            const next = argv[i + 1];
            if (next && !next.startsWith('--')) {
                args.capoDropCorrection = ['yes', 'y', 'true', '1'].includes(next.toLowerCase());
                i++;
            } else {
                args.capoDropCorrection = true;
            }
        } else if (arg === '--keep-tex') {
            args.keepTex = true;
        }
    }

    if (!args.output.includes('/') && !args.output.includes('\\')) {
        args.output = path.join('dist-pdfs', args.output);
    }

    return args;
}

function walkSongFilesSorted(dirPath) {
    const results = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = entries
        .filter((e) => e.isFile() && (e.name.endsWith('.md') || e.name.endsWith('.txt')))
        .map((e) => e.name)
        .sort();
    const dirs = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();

    for (const f of files) {
        results.push(path.join(dirPath, f));
    }
    for (const d of dirs) {
        results.push(...walkSongFilesSorted(path.join(dirPath, d)));
    }
    return results;
}

async function loadSongsFromDatabase(dbPath, playlistName) {
    const SQL = await initSqlJs();
    const bytes = fs.readFileSync(dbPath);
    const db = new SQL.Database(new Uint8Array(bytes));

    let sql = `
        SELECT songs.name AS songName, bands.name AS bandName, songs.capo AS capo,
               songs.key AS songKey, songs.contents AS contents
        FROM songs
        JOIN bands ON songs.band_id = bands.id
    `;
    const params = [];

    if (playlistName) {
        sql += `
            JOIN playlists_songs ON playlists_songs.song_id = songs.id
            JOIN playlists ON playlists.id = playlists_songs.playlist_id
            WHERE playlists.name = ?
        `;
        params.push(playlistName);
    }

    sql += ' ORDER BY bands.name COLLATE NOCASE ASC, songs.name COLLATE NOCASE ASC;';

    const stmt = db.prepare(sql);
    stmt.bind(params);
    const songs = [];
    while (stmt.step()) {
        const row = stmt.getAsObject();
        songs.push({
            fullTitle: `${row.bandName} - ${row.songName}`,
            songName: row.songName,
            capo: row.capo ? Number(row.capo) : 0,
            songKey: row.songKey || null,
            contents: row.contents || '',
        });
    }
    stmt.free();
    db.close();
    return songs;
}

async function loadSongsFromDirectory(inputDir) {
    const schemaMod = await loadMasterSongSchema();
    const files = walkSongFilesSorted(inputDir);
    const songs = [];

    for (const fullPath of files) {
        const filename = path.basename(fullPath);
        const ext = path.extname(filename);
        const fullTitle = filename.slice(0, -ext.length);
        const songName = fullTitle.includes(' - ')
            ? fullTitle.split(' - ').slice(1).join(' - ')
            : fullTitle;

        const rawText = fs.readFileSync(fullPath, 'utf8');
        const { data, content } = schemaMod.parseFrontmatterFile(rawText);

        let capo = data.capo ? Number(data.capo) : 0;
        if (data.drop !== undefined && data.drop !== null) {
            capo = -Number(data.drop);
        }

        songs.push({
            fullTitle,
            songName,
            capo,
            songKey: data.key || null,
            contents: content,
        });
    }

    return songs;
}

async function main() {
    console.log('-------------------------------------');
    console.log('Welcome to Acordismo PDF Songbook Gen');
    console.log('-------------------------------------');

    const args = parseArgs(process.argv);
    const { transposeSongContents } = await loadMasterChordTransposer();

    const templatePath = path.resolve(ROOT_DIR, args.template);
    if (!fs.existsSync(templatePath)) {
        console.error(`Template file not found: ${templatePath}`);
        process.exit(1);
    }

    let manifestText = '';
    if (args.manifest) {
        const manifestPath = path.resolve(ROOT_DIR, args.manifest);
        if (fs.existsSync(manifestPath)) {
            manifestText = fs.readFileSync(manifestPath, 'utf8');
            console.log(`Using manifest file: ${manifestPath}`);
        }
    }

    let songs = [];
    if (args.input) {
        const inputDir = path.resolve(ROOT_DIR, args.input);
        console.log(`Loading songs from directory: ${inputDir}`);
        songs = await loadSongsFromDirectory(inputDir);
    } else {
        const dbPath = path.resolve(ROOT_DIR, args.db);
        console.log(
            `Loading songs from database: ${dbPath}${args.playlist ? ` (Playlist: ${args.playlist})` : ''}`
        );
        songs = await loadSongsFromDatabase(dbPath, args.playlist);
    }

    if (songs.length === 0) {
        console.error('No songs found to include in the PDF songbook.');
        process.exit(1);
    }

    let rep = '';
    for (const song of songs) {
        if (manifestText && manifestText.includes(song.fullTitle)) {
            console.log('Skipping (in manifest):', song.fullTitle);
            continue;
        }

        const safeFullTitle = escapeLatexHeader(song.fullTitle);
        const safeSongName = escapeLatexHeader(song.songName);

        rep += '%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%\n';
        rep += `\\chapter{${safeFullTitle}}\n`;
        rep += `\\index{{aux-song-index-file}}{${safeSongName}}\n`;
        rep += '\\begin{alltt}\n';

        if (args.transpose !== 0) {
            rep += `(all chords have been pre-transposed ${args.transpose} semitones)\n\n`;
        }

        if (song.capo) {
            if (args.capoDropCorrection) {
                if (song.capo > 0) {
                    rep += `(chords for no capo; generated from capo ${song.capo})\n\n`;
                } else if (song.capo < 0) {
                    rep += `(chords for no drop; generated from drop ${-song.capo})\n\n`;
                }
            } else {
                if (song.capo > 0) {
                    rep += `(chords for capo on ${song.capo})\n\n`;
                } else if (song.capo < 0) {
                    rep += `(chords for drop ${-song.capo} semitones)\n\n`;
                }
            }
        }

        const effectiveBody =
            args.transpose !== 0 || args.capoDropCorrection
                ? transposeSongContents(song.contents.trim(), args.transpose, {
                      applyCapoDropCorrection: args.capoDropCorrection,
                      frontmatterCapo: song.capo,
                      songKeyHint: song.songKey,
                  })
                : song.contents.trim();

        rep += escapeLatexAlltt(effectiveBody);
        rep += '\n\\end{alltt}\n';
    }

    rep = rep.replace(/\(/g, '\\textbf{(').replace(/\)/g, ')}');
    rep = rep.replace(/\[/g, '\\textit{[').replace(/\]/g, ']}');
    rep = rep.replace(/\{\{aux-song-index-file\}\}/g, '[aux-song-index-file]');

    const outputFullPath = path.resolve(ROOT_DIR, args.output);
    const outputParsed = path.parse(outputFullPath);
    const outputDir = outputParsed.dir || DEFAULT_PDF_OUT_DIR;
    const outputBaseName = outputParsed.name;
    const outputTexPath = path.join(outputDir, `${outputBaseName}.tex`);

    let templateContent = fs.readFileSync(templatePath, 'utf8');
    templateContent = templateContent.replace(/TITLE/g, escapeLatexHeader(outputBaseName));
    templateContent = templateContent.replace('genSongbook', rep);

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputTexPath, templateContent, 'utf8');
    console.log(`Generated LaTeX file: ${outputTexPath}`);

    console.log('Running pdflatex (pass 1 of 2)...');
    const pass1 = spawnSync(
        'pdflatex',
        ['-interaction=nonstopmode', `-output-directory=${outputDir}`, outputTexPath],
        { cwd: outputDir, stdio: 'inherit' }
    );
    if (pass1.error) {
        console.warn(
            `\n⚠️  pdflatex is not installed or failed to launch (${pass1.error.message}). Kept ${outputTexPath} so you can compile it manually.`
        );
        return;
    }
    if (pass1.status !== 0 && !fs.existsSync(outputFullPath)) {
        console.error(`pdflatex (pass 1 of 2) failed to produce PDF (exit code ${pass1.status})`);
        process.exit(pass1.status);
    }

    const idxFile = path.join(outputDir, 'aux-song-index-file.idx');
    if (fs.existsSync(idxFile)) {
        spawnSync('makeindex', ['aux-song-index-file.idx'], {
            cwd: outputDir,
            stdio: 'inherit',
        });
    }

    console.log('Running pdflatex (pass 2 of 2)...');
    const pass2 = spawnSync(
        'pdflatex',
        ['-interaction=nonstopmode', `-output-directory=${outputDir}`, outputTexPath],
        { cwd: outputDir, stdio: 'inherit' }
    );
    if (pass2.status !== 0 && !fs.existsSync(outputFullPath)) {
        console.error(`pdflatex (pass 2 of 2) failed to produce PDF (exit code ${pass2.status})`);
        process.exit(pass2.status);
    }

    const auxFiles = [
        'aux-song-index-file.idx',
        'aux-song-index-file.ilg',
        'aux-song-index-file.ind',
        `${outputBaseName}.aux`,
        `${outputBaseName}.log`,
        `${outputBaseName}.out`,
        `${outputBaseName}.toc`,
    ];
    if (!args.keepTex) {
        auxFiles.push(`${outputBaseName}.tex`);
    }

    for (const f of auxFiles) {
        const p = path.join(outputDir, f);
        if (fs.existsSync(p)) {
            fs.unlinkSync(p);
        }
    }

    console.log(`✅ DONE! Generated ${outputFullPath}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
