#!/usr/bin/env node
/**
 * @file scripts/build-db.mjs
 * @version 3.6.0
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import initSqlJs from 'sql.js';
import {
    SCHEMA_SQL,
    INDEX_SQL,
    wildcardToRegExp,
    mergeDatabasesInPriorityOrder,
} from '../src/shared/dbMerger.js';

export const __version__ = '3.6.0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Dynamically loads the Single Source of Truth songSchema.js from smallhotelroom.github.io
const EXTERNAL_SCHEMA_PATH = path.resolve(
    ROOT_DIR,
    '../smallhotelroom.github.io/src/shared/songSchema.js'
);

export async function loadMasterSongSchema() {
    if (!fs.existsSync(EXTERNAL_SCHEMA_PATH)) {
        throw new Error(
            `Master songSchema.js not found at ${EXTERNAL_SCHEMA_PATH}. Please ensure smallhotelroom.github.io is cloned alongside acordismo.`
        );
    }
    return await import(pathToFileURL(EXTERNAL_SCHEMA_PATH).href);
}

function formatClickableLocation(fullPath, line = 1, col = 1) {
    const encodedPath = fullPath.split(path.sep).map(encodeURIComponent).join('/');
    return `"${fullPath}:${line}:${col}" ( vscode://file${encodedPath}:${line}:${col} )`;
}

function validateSongFrontmatter(
    frontmatterData,
    keyLines,
    rawFileName,
    fullPath,
    schemaMod,
    isOfficialLayer = false
) {
    const errors = [];
    const keys = Object.keys(frontmatterData);
    if (keys.length === 0 && !isOfficialLayer) {
        return errors;
    }

    if (isOfficialLayer) {
        const missing = schemaMod.getMissingKeys(frontmatterData, rawFileName);
        if (missing.length > 0) {
            errors.push(
                `${formatClickableLocation(fullPath, 1, 1)} — Missing required keys: ${missing.join(', ')}`
            );
        }
    }

    const { isValid, expected } = schemaMod.validateAlphabeticalOrder(keys);
    if (!isValid) {
        for (let i = 0; i < keys.length; i++) {
            if (keys[i] !== expected[i]) {
                const offendingKey = keys[i];
                const expectedKey = expected[i];
                const lineNum = keyLines[expectedKey] || keyLines[offendingKey] || 1;
                errors.push(
                    `${formatClickableLocation(fullPath, lineNum, 1)} — Frontmatter keys are not in alphabetical order: found '${offendingKey}' where '${expectedKey}' was expected.\n    Found order:    [${keys.join(', ')}]\n    Expected order: [${expected.join(', ')}]`
                );
                break;
            }
        }
    }

    return errors;
}

function loadDotEnv() {
    const envPath = path.join(ROOT_DIR, '.env');
    if (!fs.existsSync(envPath)) {
        return;
    }
    const content = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) {
            continue;
        }
        const key = line.slice(0, eqIdx).trim();
        let val = line.slice(eqIdx + 1).trim();
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) {
            val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
            process.env[key] = val;
        }
    }
}

function resolveConfigPath(rawStr) {
    if (!rawStr || typeof rawStr !== 'string') {
        return null;
    }
    let missingVar = false;
    const expanded = rawStr.replace(/\$\{([^}:]+)(?::-([^}]*))?\}/g, (_, varName, defVal) => {
        const envVal = process.env[varName];
        if (envVal !== undefined && envVal !== '') {
            return envVal;
        }
        if (defVal !== undefined) {
            return defVal;
        }
        missingVar = true;
        return '';
    });

    if (missingVar || !expanded.trim()) {
        return null;
    }

    let normalized = expanded.trim();
    if (normalized === '~') {
        normalized = os.homedir();
    } else if (normalized.startsWith('~/') || normalized.startsWith('~\\')) {
        normalized = path.join(os.homedir(), normalized.slice(2));
    }

    return path.resolve(ROOT_DIR, normalized);
}

function expandEnvString(rawStr) {
    if (!rawStr || typeof rawStr !== 'string') {
        return '';
    }
    let missingVar = false;
    const expanded = rawStr.replace(/\$\{([^}:]+)(?::-([^}]*))?\}/g, (_, varName, defVal) => {
        const envVal = process.env[varName];
        if (envVal !== undefined && envVal !== '') {
            return envVal;
        }
        if (defVal !== undefined) {
            return defVal;
        }
        missingVar = true;
        return '';
    });
    return missingVar ? '' : expanded.trim();
}

function parseDbOriginsYaml(yamlText) {
    const config = { layers: [], merged_output: null };
    let currentLayer = null;
    let currentSection = null;
    let currentItem = null;

    const unquote = (v) => {
        const s = v.trim();
        if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
            return s.slice(1, -1);
        }
        if (/^-?\d+(\.\d+)?$/.test(s)) {
            return Number(s);
        }
        return s;
    };

    for (const rawLine of yamlText.split(/\r?\n/)) {
        const stripped = rawLine.replace(/\s+#.*$/, '').trimEnd();
        const trimmed = stripped.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const indent = stripped.search(/\S/);

        if (indent === 0) {
            if (trimmed.startsWith('merged_output:')) {
                config.merged_output = unquote(trimmed.slice('merged_output:'.length));
            }
            continue;
        }

        if (indent === 2 && trimmed.startsWith('- id:')) {
            currentLayer = {
                id: unquote(trimmed.slice('- id:'.length)),
                output: null,
                also_copy_to: null,
                sources: [],
                playlists: [],
            };
            config.layers.push(currentLayer);
            currentSection = null;
            currentItem = null;
            continue;
        }

        if (!currentLayer) {
            continue;
        }

        if (indent === 4) {
            if (trimmed === 'sources:') {
                currentSection = 'sources';
                currentItem = null;
            } else if (trimmed === 'playlists:') {
                currentSection = 'playlists';
                currentItem = null;
            } else {
                const colonIdx = trimmed.indexOf(':');
                if (colonIdx !== -1) {
                    const k = trimmed.slice(0, colonIdx).trim();
                    const v = unquote(trimmed.slice(colonIdx + 1));
                    currentLayer[k] = v;
                }
            }
            continue;
        }

        if (indent === 6 && trimmed.startsWith('- ')) {
            currentItem = {};
            if (currentSection === 'sources') {
                currentLayer.sources.push(currentItem);
            } else if (currentSection === 'playlists') {
                currentLayer.playlists.push(currentItem);
            }
            const rest = trimmed.slice(2);
            const colonIdx = rest.indexOf(':');
            if (colonIdx !== -1) {
                const k = rest.slice(0, colonIdx).trim();
                const v = unquote(rest.slice(colonIdx + 1));
                currentItem[k] = v;
            }
            continue;
        }

        if (indent >= 8 && currentItem) {
            const colonIdx = trimmed.indexOf(':');
            if (colonIdx !== -1) {
                const k = trimmed.slice(0, colonIdx).trim();
                const v = unquote(trimmed.slice(colonIdx + 1));
                currentItem[k] = v;
            }
        }
    }

    return config;
}

function serializeField(val) {
    if (val === undefined || val === null) {
        return null;
    }
    if (typeof val === 'object') {
        return JSON.stringify(val);
    }
    return String(val);
}

function decodeHtmlEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

function stripHtmlTags(html) {
    return decodeHtmlEntities(html.replace(/<[^>]*>/g, ''));
}

function walkFilesSorted(dirPath) {
    const results = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = entries
        .filter((e) => e.isFile())
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
        results.push(...walkFilesSorted(path.join(dirPath, d)));
    }
    return results;
}

function queryAll(db, sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const out = [];
    while (stmt.step()) {
        out.push(stmt.getAsObject());
    }
    stmt.free();
    return out;
}

function buildLayerDatabase(SQL, layerConfig, schemaMod) {
    console.log(`\n========================================`);
    console.log(`Building Layer: ${layerConfig.id}`);
    console.log(`========================================`);

    const db = new SQL.Database();
    db.run(SCHEMA_SQL);

    const bandCache = new Map();
    const playlistCache = new Map();
    let insertedSongsCount = 0;
    const isOfficialLayer = layerConfig.id === 'official';
    const treatedKeysSet = new Set(schemaMod.TREATED_KEYS || []);

    const getOrCreateBand = (bandName) => {
        const clean = bandName.trim();
        if (bandCache.has(clean)) {
            return bandCache.get(clean);
        }
        db.run('INSERT INTO bands (name) VALUES (?);', [clean]);
        const id = queryAll(db, 'SELECT last_insert_rowid() AS id;')[0].id;
        bandCache.set(clean, id);
        return id;
    };

    const getOrCreatePlaylist = (playlistName) => {
        const clean = playlistName.trim();
        if (playlistCache.has(clean)) {
            return playlistCache.get(clean);
        }
        db.run('INSERT INTO playlists (name) VALUES (?);', [clean]);
        const id = queryAll(db, 'SELECT last_insert_rowid() AS id;')[0].id;
        playlistCache.set(clean, id);
        return id;
    };

    db.run('BEGIN TRANSACTION;');

    for (const src of layerConfig.sources || []) {
        const srcType = src.type || 'markdown_dir';
        const srcPath = resolveConfigPath(src.path);
        if (!srcPath || !fs.existsSync(srcPath)) {
            console.log(
                `⚠️  [SKIP] Source in layer '${layerConfig.id}': path not found or env unset (${src.path})`
            );
            continue;
        }

        if (srcType === 'markdown_dir') {
            console.log(`-> Ingesting markdown_dir: ${srcPath} -> Playlist "${src.playlist}"`);
            const files = walkFilesSorted(srcPath);

            for (const fullPath of files) {
                const filename = path.basename(fullPath);
                if (!filename.endsWith('.md') && !filename.endsWith('.txt')) {
                    continue;
                }
                const ext = path.extname(filename);
                const baseName = filename.slice(0, -ext.length);
                console.log('* ' + baseName);

                const splitIdx = baseName.indexOf(' - ');
                if (splitIdx === -1) {
                    console.log(
                        `** Skipping ${formatClickableLocation(fullPath, 1, 1)} — Invalid filename format (missing ' - ')`
                    );
                    continue;
                }

                const bandName = baseName.slice(0, splitIdx);
                const songName = baseName.slice(splitIdx + 3);

                const rawText = fs.readFileSync(fullPath, 'utf8');
                const { data: song, keyLines, content } = schemaMod.parseFrontmatterFile(rawText);

                const schemaErrors = validateSongFrontmatter(
                    song,
                    keyLines,
                    baseName,
                    fullPath,
                    schemaMod,
                    isOfficialLayer
                );
                if (schemaErrors.length > 0) {
                    if (isOfficialLayer) {
                        throw new Error(
                            `\n❌ Schema validation failed:\n  ${schemaErrors.join('\n  ')}\n`
                        );
                    } else {
                        for (const errStr of schemaErrors) {
                            console.log(`** [Schema Notice] ${errStr}`);
                        }
                    }
                }

                const bandId = getOrCreateBand(bandName);
                const playlistId = getOrCreatePlaylist(src.playlist);

                const album = song.album ?? null;
                const author = song.author ?? null;
                const bpm = song.bpm ?? null;
                let capo = song.capo ?? null;
                if (song.drop !== undefined && song.drop !== null) {
                    capo = -Number(song.drop);
                }

                const falsetto = song.falsetto ?? null;
                const highest = song.highest ?? null;
                const initNote =
                    song.initNote !== undefined && song.initNote !== null
                        ? String(song.initNote)
                        : song.init !== undefined && song.init !== null
                          ? String(song.init)
                          : null;
                const isrc = song.isrc ?? null;
                const songKey = song.key ?? null;
                const lang = song.lang ?? null;
                const licenseStr = song.license ?? null;
                const musicians = serializeField(song.musicians);
                const spotify = song.spotify ?? null;
                const timeSig =
                    song.time_signature !== undefined && song.time_signature !== null
                        ? String(song.time_signature)
                        : null;
                const track = song.track ?? null;
                const url = song.url ?? null;
                const writer = song.writer ?? author;

                const rawHashInput = `${bandName.trim()}|${songName.trim()}|${content.trim()}`;
                const contentHash = crypto
                    .createHash('sha256')
                    .update(rawHashInput, 'utf8')
                    .digest('hex')
                    .slice(0, 16);

                db.run(
                    `INSERT INTO songs (
                        content_hash, name, band_id, origin_id, album, author, bpm, capo,
                        falsetto, highest, init_note, isrc, key, lang, license, musicians,
                        spotify, time_signature, track, url, writer, contents
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                    [
                        contentHash,
                        songName,
                        bandId,
                        0,
                        album,
                        author,
                        bpm,
                        capo,
                        falsetto,
                        highest,
                        initNote,
                        isrc,
                        songKey,
                        lang,
                        licenseStr,
                        musicians,
                        spotify,
                        timeSig,
                        track,
                        url,
                        writer,
                        content,
                    ]
                );

                const songId = queryAll(db, 'SELECT last_insert_rowid() AS id;')[0].id;
                insertedSongsCount++;

                const untreatedKeys = Object.keys(song).filter((k) => !treatedKeysSet.has(k));
                if (untreatedKeys.length > 0) {
                    console.log(`** untreatedKeys in ${filename}:`, untreatedKeys);
                }

                if (song.featuring) {
                    console.log("** song['featuring']:", song.featuring);
                    for (const part of String(song.featuring).split(';')) {
                        const ftBandName = part.trim();
                        if (!ftBandName) {
                            continue;
                        }
                        console.log('*** featuringBandName:', ftBandName);
                        const ftBandId = getOrCreateBand(ftBandName);
                        db.run(
                            'INSERT INTO songs_ft_bands (song_id, ft_band_id) VALUES (?, ?);',
                            [songId, ftBandId]
                        );
                    }
                }

                db.run('INSERT INTO playlists_songs (playlist_id, song_id) VALUES (?, ?);', [
                    playlistId,
                    songId,
                ]);
            }
        } else if (srcType === 'dataset_zk' || srcType === 'dataset_lk') {
            const subDirName = expandEnvString(src.subdir);
            const cacheRoot = resolveConfigPath(src.cache);
            if (!subDirName) {
                console.log(`⚠️  [SKIP] Crawler source '${srcType}': subdir env var not set`);
                continue;
            }

            const cacheTypeDir = cacheRoot ? path.join(cacheRoot, subDirName) : null;
            const playlistName =
                src.playlist || (srcType === 'dataset_zk' ? 'OrigenZK' : 'OrigenLK');
            const maxErrors = Number(src.max_errors || 5);
            let errorCount = 0;

            const bandEntries = fs
                .readdirSync(srcPath, { withFileTypes: true })
                .filter((e) => e.isDirectory())
                .map((e) => e.name)
                .sort();

            for (const bandName of bandEntries) {
                const inputDirectory = path.join(srcPath, bandName, subDirName);
                if (!fs.existsSync(inputDirectory) || !fs.statSync(inputDirectory).isDirectory()) {
                    continue;
                }

                console.log('* ' + bandName);

                if (srcType === 'dataset_zk') {
                    const files = walkFilesSorted(inputDirectory);
                    for (const fullFileName of files) {
                        const filename = path.basename(fullFileName);
                        const ext = path.extname(filename);
                        const name = filename.slice(0, -ext.length);

                        let songName = null;
                        let songContent = null;

                        const cacheBandDir = cacheTypeDir ? path.join(cacheTypeDir, bandName) : null;
                        const cacheFilePath = cacheBandDir
                            ? path.join(cacheBandDir, `${name}.json`)
                            : null;

                        let useCache = false;
                        if (cacheFilePath && fs.existsSync(cacheFilePath)) {
                            if (
                                fs.statSync(cacheFilePath).mtimeMs >=
                                fs.statSync(fullFileName).mtimeMs
                            ) {
                                useCache = true;
                            }
                        }

                        if (useCache) {
                            const cachedData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
                            songName = cachedData.name;
                            songContent = cachedData.content;
                            console.log(`** (cached) ${bandName} - ${songName}`);
                        } else {
                            const html = fs.readFileSync(fullFileName, 'utf8');
                            const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
                            const rawTitle = titleMatch
                                ? decodeHtmlEntities(titleMatch[1].trim())
                                : '';

                            if (rawTitle.includes('Página no encontrada')) {
                                console.log('** Skipping (404 Page): ' + fullFileName);
                                continue;
                            }
                            if (rawTitle.includes('tu sitio de cifrados y tablaturas')) {
                                console.log('** Skipping (Homepage Redirect): ' + fullFileName);
                                continue;
                            }

                            songName = `${rawTitle.split(' - ')[0]} (${playlistName})`;
                            const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
                            if (!preMatch) {
                                console.log(
                                    '** Skipping (Unknown error, no <pre> tag): ' + fullFileName
                                );
                                errorCount++;
                                if (errorCount > maxErrors) {
                                    throw new Error(
                                        `CRITICAL ERROR: Exceeded ${maxErrors} malformed files in ${srcType}.`
                                    );
                                }
                                continue;
                            }

                            songContent = stripHtmlTags(preMatch[1]);
                            console.log(`** ${bandName} - ${songName}`);

                            if (cacheBandDir && cacheFilePath) {
                                fs.mkdirSync(cacheBandDir, { recursive: true });
                                fs.writeFileSync(
                                    cacheFilePath,
                                    JSON.stringify({ name: songName, content: songContent })
                                );
                            }
                        }

                        if (songName && songContent !== null) {
                            const bandId = getOrCreateBand(bandName);
                            const playlistId = getOrCreatePlaylist(playlistName);
                            db.run(
                                'INSERT INTO songs (name, band_id, origin_id, contents) VALUES (?, ?, ?, ?);',
                                [songName, bandId, 1, songContent]
                            );
                            const songId = queryAll(db, 'SELECT last_insert_rowid() AS id;')[0].id;
                            db.run(
                                'INSERT INTO playlists_songs (playlist_id, song_id) VALUES (?, ?);',
                                [playlistId, songId]
                            );
                            insertedSongsCount++;
                        }
                    }
                } else if (srcType === 'dataset_lk') {
                    const subDirs = fs
                        .readdirSync(inputDirectory, { withFileTypes: true })
                        .filter((e) => e.isDirectory())
                        .map((e) => e.name)
                        .sort();

                    for (const songDirName of subDirs) {
                        const fullFileName = path.join(
                            inputDirectory,
                            songDirName,
                            `${songDirName}.shtml`
                        );
                        if (!fs.existsSync(fullFileName) || !fs.statSync(fullFileName).isFile()) {
                            continue;
                        }

                        let songName = null;
                        let songContent = null;

                        const cacheBandDir = cacheTypeDir ? path.join(cacheTypeDir, bandName) : null;
                        const cacheFilePath = cacheBandDir
                            ? path.join(cacheBandDir, `${songDirName}.json`)
                            : null;

                        let useCache = false;
                        if (cacheFilePath && fs.existsSync(cacheFilePath)) {
                            if (
                                fs.statSync(cacheFilePath).mtimeMs >=
                                fs.statSync(fullFileName).mtimeMs
                            ) {
                                useCache = true;
                            }
                        }

                        if (useCache) {
                            const cachedData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
                            songName = cachedData.name;
                            songContent = cachedData.content;
                            console.log(`** (cached) ${bandName} - ${songName}`);
                        } else {
                            const htmlContent = fs.readFileSync(fullFileName, 'utf8');
                            const titleMatch = htmlContent.match(
                                /<title[^>]*>([\s\S]*?)<\/title>/i
                            );
                            const rawTitle = titleMatch
                                ? decodeHtmlEntities(titleMatch[1].trim())
                                : '';
                            const rawPrefix = rawTitle.split(', ')[0] || songDirName;
                            const titleCased = rawPrefix.replace(
                                /\w\S*/g,
                                (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
                            );
                            songName = `${titleCased} (${playlistName})`;

                            const resBodyMatches = [
                                ...htmlContent.matchAll(/res\.body\s*\+=\s*'(.*)';/g),
                            ].map((m) => m[1]);

                            if (resBodyMatches.length > 0) {
                                const joined = resBodyMatches
                                    .join('')
                                    .replace(/\\'/g, "'")
                                    .replace(/\\n/g, '\n');
                                songContent = stripHtmlTags(joined);
                            } else {
                                const preMatches = [
                                    ...htmlContent.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi),
                                ];
                                if (preMatches.length < 2) {
                                    console.log(
                                        `** Skipping (Expected JS res.body or 2 <pre> tags, found ${preMatches.length}): ${rawTitle}`
                                    );
                                    errorCount++;
                                    if (errorCount > maxErrors) {
                                        throw new Error(
                                            `CRITICAL ERROR: Exceeded ${maxErrors} malformed files in ${srcType}.`
                                        );
                                    }
                                    continue;
                                }
                                songContent = stripHtmlTags(preMatches[1][1]);
                            }

                            console.log(`** ${bandName} - ${songName}`);

                            if (cacheBandDir && cacheFilePath) {
                                fs.mkdirSync(cacheBandDir, { recursive: true });
                                fs.writeFileSync(
                                    cacheFilePath,
                                    JSON.stringify({ name: songName, content: songContent })
                                );
                            }
                        }

                        if (songName && songContent !== null) {
                            const bandId = getOrCreateBand(bandName);
                            const playlistId = getOrCreatePlaylist(playlistName);
                            db.run(
                                'INSERT INTO songs (name, band_id, origin_id, contents) VALUES (?, ?, ?, ?);',
                                [songName, bandId, 2, songContent]
                            );
                            const songId = queryAll(db, 'SELECT last_insert_rowid() AS id;')[0].id;
                            db.run(
                                'INSERT INTO playlists_songs (playlist_id, song_id) VALUES (?, ?);',
                                [playlistId, songId]
                            );
                            insertedSongsCount++;
                        }
                    }
                }
            }
        }
    }

    for (const plRule of layerConfig.playlists || []) {
        if (!plRule.name) {
            continue;
        }

        if (plRule.match) {
            db.run(
                'INSERT INTO playlist_rules (playlist_name, match_pattern) VALUES (?, ?);',
                [plRule.name, plRule.match]
            );
            const regex = wildcardToRegExp(plRule.match);
            const allSongs = queryAll(
                db,
                'SELECT songs.id AS id, songs.name AS sname, bands.name AS bname FROM songs JOIN bands ON songs.band_id = bands.id;'
            );
            const matchingIds = allSongs
                .filter((row) => regex.test(`${row.bname} - ${row.sname}`))
                .map((row) => row.id);

            if (matchingIds.length > 0) {
                const playlistId = getOrCreatePlaylist(plRule.name);
                for (const sId of matchingIds) {
                    db.run(
                        'INSERT INTO playlists_songs (playlist_id, song_id) VALUES (?, ?);',
                        [playlistId, sId]
                    );
                }
            }
        } else if (plRule.from_file) {
            const listPath = resolveConfigPath(plRule.from_file);
            if (!listPath || !fs.existsSync(listPath)) {
                console.log(
                    `⚠️  [SKIP] Playlist file for '${plRule.name}' not found (${plRule.from_file})`
                );
                continue;
            }
            const lines = fs.readFileSync(listPath, 'utf8').split(/\r?\n/);
            const playlistId = getOrCreatePlaylist(plRule.name);
            db.run('DELETE FROM playlists_songs WHERE playlist_id = ?;', [playlistId]);

            for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line) {
                    continue;
                }
                const splitIdx = line.indexOf(' - ');
                if (splitIdx === -1) {
                    continue;
                }
                const bandName = line.slice(0, splitIdx);
                const songName = line.slice(splitIdx + 3);
                const found = queryAll(
                    db,
                    `SELECT songs.id AS id FROM songs
                     JOIN bands ON songs.band_id = bands.id
                     WHERE LOWER(bands.name) = LOWER(?) AND LOWER(songs.name) = LOWER(?)
                     LIMIT 1;`,
                    [bandName, songName]
                );
                if (found.length > 0) {
                    db.run(
                        'INSERT INTO playlists_songs (playlist_id, song_id) VALUES (?, ?);',
                        [playlistId, found[0].id]
                    );
                } else {
                    console.log(`⚠️  [WARN] Playlist '${plRule.name}': Song not found (${line})`);
                }
            }
        }
    }

    db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?);', [
        'layer_id',
        layerConfig.id,
    ]);
    db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?);', [
        'generated_at',
        new Date().toISOString(),
    ]);

    db.run(INDEX_SQL);
    db.run('COMMIT;');

    if (insertedSongsCount === 0) {
        console.log(`ℹ️  Layer '${layerConfig.id}' produced 0 songs — skipping file output.`);
        db.close();
        return null;
    }

    const exportedBytes = db.export();
    const writeTarget = (relPath) => {
        if (!relPath) {
            return;
        }
        const fullOut = path.resolve(ROOT_DIR, relPath);
        fs.mkdirSync(path.dirname(fullOut), { recursive: true });
        fs.writeFileSync(fullOut, Buffer.from(exportedBytes));
        console.log(`✅ Wrote ${relPath} (${insertedSongsCount} songs)`);
    };

    writeTarget(layerConfig.output);
    writeTarget(layerConfig.also_copy_to);

    return db;
}

async function main() {
    loadDotEnv();
    const schemaMod = await loadMasterSongSchema();

    const configPath = path.join(ROOT_DIR, 'db-origins.yaml');
    if (!fs.existsSync(configPath)) {
        console.error(`Error: db-origins.yaml not found at ${configPath}`);
        process.exit(1);
    }

    const config = parseDbOriginsYaml(fs.readFileSync(configPath, 'utf8'));
    const SQL = await initSqlJs();

    const builtDbs = [];
    for (const layer of config.layers) {
        const db = buildLayerDatabase(SQL, layer, schemaMod);
        if (db) {
            builtDbs.push(db);
        }
    }

    if (builtDbs.length > 1 && config.merged_output) {
        console.log(`\n========================================`);
        console.log(`Merging ${builtDbs.length} active layers in priority order...`);
        console.log(`========================================`);
        const mergedDb = mergeDatabasesInPriorityOrder(SQL, builtDbs, 'merged-all');
        const totalSongs = queryAll(mergedDb, 'SELECT COUNT(*) AS c FROM songs;')[0].c;
        const totalBands = queryAll(mergedDb, 'SELECT COUNT(*) AS c FROM bands;')[0].c;
        const fullMergedPath = path.resolve(ROOT_DIR, config.merged_output);
        fs.mkdirSync(path.dirname(fullMergedPath), { recursive: true });
        fs.writeFileSync(fullMergedPath, Buffer.from(mergedDb.export()));
        console.log(
            `✅ Wrote merged database ${config.merged_output} (${totalSongs} unique songs across ${totalBands} bands)`
        );
        mergedDb.close();
    }

    for (const db of builtDbs) {
        db.close();
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main().catch((err) => {
        console.error(err.message || err);
        process.exit(1);
    });
}
