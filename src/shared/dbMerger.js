/**
 * @file src/shared/dbMerger.js
 * @version 1.7.0
 */
import { hasCrawlerSongAndChords } from './crawlerTransposer.js';

export const __version__ = '1.7.0';

export const DB_SCHEMA_VERSION = '2';

/**
 * Strips diacritics/accents (e.g. "Leãozinho" -> "leaozinho", "Español" -> "espanol"),
 * removes apostrophes ("Don't" -> "dont"), and normalizes whitespace to lowercase
 * for instant accent- and apostrophe-insensitive multi-token search.
 */
export function normalizeSearchText(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/['’‘`ʼ\u2018\u2019\u201B\u2032]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Splits a user's search query into normalized diacritic-free, apostrophe-free tokens.
 */
export function tokenizeSearchQuery(queryStr) {
    const norm = normalizeSearchText(queryStr);
    return norm ? norm.split(' ').filter(Boolean) : [];
}

/**
 * Builds a parameterized SQL condition and params array for multi-token accent- & apostrophe-free search.
 */
export function buildMultiTokenSearchClause(
    rawQuery,
    normColumn = 'songs.search_norm',
    includeLyrics = false
) {
    const normTokens = tokenizeSearchQuery(rawQuery);
    if (normTokens.length === 0) {
        return { sqlCondition: '', params: [] };
    }

    const rawTokens = String(rawQuery || '')
        .toLowerCase()
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    const clauses = [];
    const params = [];

    for (let i = 0; i < normTokens.length; i++) {
        const normLike = `%${normTokens[i]}%`;
        const rawLike = `%${rawTokens[i] || normTokens[i]}%`;

        if (includeLyrics) {
            clauses.push(
                `(${normColumn} LIKE ? OR REPLACE(LOWER(songs.contents), '''', '') LIKE ? OR LOWER(songs.contents) LIKE ?)`
            );
            params.push(normLike, normLike, rawLike);
        } else {
            clauses.push(`(${normColumn} LIKE ?)`);
            params.push(normLike);
        }
    }

    return {
        sqlCondition: clauses.join(' AND '),
        params,
    };
}

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
);
CREATE TABLE IF NOT EXISTS bands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    has_chords INTEGER NOT NULL DEFAULT 1,
    search_norm TEXT
);
CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    search_norm TEXT
);
CREATE TABLE IF NOT EXISTS playlist_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_name TEXT NOT NULL,
    match_pattern TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_hash TEXT,
    name TEXT NOT NULL,
    band_id INTEGER NOT NULL,
    origin_id INTEGER NOT NULL,
    has_chords INTEGER NOT NULL DEFAULT 1,
    search_norm TEXT,
    album TEXT,
    author TEXT,
    bpm INTEGER,
    capo INTEGER,
    falsetto TEXT,
    highest TEXT,
    init_note TEXT,
    isrc TEXT,
    key TEXT,
    lang TEXT,
    license TEXT,
    musicians TEXT,
    spotify TEXT,
    time_signature TEXT,
    track INTEGER,
    url TEXT,
    writer TEXT,
    contents TEXT,
    FOREIGN KEY (band_id) REFERENCES bands (id)
);
CREATE TABLE IF NOT EXISTS songs_ft_bands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER NOT NULL,
    ft_band_id INTEGER NOT NULL,
    FOREIGN KEY (song_id) REFERENCES songs (id),
    FOREIGN KEY (ft_band_id) REFERENCES bands (id)
);
CREATE TABLE IF NOT EXISTS playlists_songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    song_id INTEGER NOT NULL,
    FOREIGN KEY (playlist_id) REFERENCES playlists (id),
    FOREIGN KEY (song_id) REFERENCES songs (id)
);
`;

export const INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_bands_name ON bands (name);
CREATE INDEX IF NOT EXISTS idx_bands_has_chords ON bands (has_chords);
CREATE INDEX IF NOT EXISTS idx_bands_search_norm ON bands (search_norm);
CREATE INDEX IF NOT EXISTS idx_playlists_name ON playlists (name);
CREATE INDEX IF NOT EXISTS idx_playlists_search_norm ON playlists (search_norm);
CREATE INDEX IF NOT EXISTS idx_songs_name ON songs (name);
CREATE INDEX IF NOT EXISTS idx_songs_band_id ON songs (band_id);
CREATE INDEX IF NOT EXISTS idx_songs_hash ON songs (content_hash);
CREATE INDEX IF NOT EXISTS idx_songs_has_chords ON songs (has_chords);
CREATE INDEX IF NOT EXISTS idx_songs_search_norm ON songs (search_norm);
CREATE INDEX IF NOT EXISTS idx_playlists_songs_playlist_id ON playlists_songs (playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlists_songs_song_id ON playlists_songs (song_id);
CREATE INDEX IF NOT EXISTS idx_songs_ft_bands_song_id ON songs_ft_bands (song_id);
CREATE INDEX IF NOT EXISTS idx_songs_ft_bands_ft_band_id ON songs_ft_bands (ft_band_id);
`;

/**
 * Updates `bands.has_chords` in a single fast SQL pass so the Bands tab never needs correlated subqueries.
 */
export const UPDATE_BANDS_HAS_CHORDS_SQL = `
UPDATE bands SET has_chords = CASE
    WHEN id IN (SELECT band_id FROM songs WHERE has_chords = 1)
      OR id IN (
          SELECT songs_ft_bands.ft_band_id
          FROM songs_ft_bands
          INNER JOIN songs ON songs_ft_bands.song_id = songs.id
          WHERE songs.has_chords = 1
      )
    THEN 1
    ELSE 0
END;
`;

function queryObjects(db, sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

function normalizeTextKey(str) {
    return (str || '').trim().toLowerCase();
}

export function wildcardToRegExp(pattern) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Populates the `meta` table with rich pack diagnostics and schema version.
 */
export function populateDatabaseMeta(
    db,
    {
        layerId = 'custom',
        packName = null,
        gitCommit = null,
        generatedAt = new Date().toISOString(),
    } = {}
) {
    const songCount = queryObjects(db, 'SELECT COUNT(*) AS c FROM songs;')[0]?.c || 0;
    const chordSongCount =
        queryObjects(db, 'SELECT COUNT(*) AS c FROM songs WHERE has_chords = 1;')[0]?.c || 0;
    const bandCount = queryObjects(db, 'SELECT COUNT(*) AS c FROM bands;')[0]?.c || 0;
    const chordBandCount =
        queryObjects(db, 'SELECT COUNT(*) AS c FROM bands WHERE has_chords = 1;')[0]?.c || 0;

    const entries = [
        ['schema_version', DB_SCHEMA_VERSION],
        ['layer_id', layerId],
        ['pack_name', packName || layerId],
        ['generated_at', generatedAt],
        ['song_count', String(songCount)],
        ['chord_song_count', String(chordSongCount)],
        ['band_count', String(bandCount)],
        ['chord_band_count', String(chordBandCount)],
    ];
    if (gitCommit) {
        entries.push(['git_commit', gitCommit]);
    }

    for (const [k, v] of entries) {
        db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?);', [k, String(v)]);
    }
}

/**
 * Reads embedded metadata from `meta` in O(1) time (falling back to COUNT queries only for legacy DBs).
 */
export function inspectDatabase(db, fallbackName = 'custom') {
    const metaMap = {};
    try {
        const metaRows = queryObjects(db, 'SELECT key, value FROM meta;');
        for (const r of metaRows) {
            if (r.key) {
                metaMap[r.key] = r.value;
            }
        }
    } catch {
        // Older DB without meta table
    }

    const layerId = metaMap.layer_id || fallbackName;
    const packName = metaMap.pack_name || layerId;
    const schemaVersion = metaMap.schema_version || '1';
    const generatedAt = metaMap.generated_at || null;
    const gitCommit = metaMap.git_commit || null;

    let songCount = metaMap.song_count !== undefined ? Number(metaMap.song_count) : null;
    let chordSongCount =
        metaMap.chord_song_count !== undefined ? Number(metaMap.chord_song_count) : null;
    let bandCount = metaMap.band_count !== undefined ? Number(metaMap.band_count) : null;
    let chordBandCount =
        metaMap.chord_band_count !== undefined ? Number(metaMap.chord_band_count) : null;

    if (songCount === null || bandCount === null) {
        try {
            songCount = queryObjects(db, 'SELECT COUNT(*) AS c FROM songs;')[0]?.c || 0;
            bandCount = queryObjects(db, 'SELECT COUNT(*) AS c FROM bands;')[0]?.c || 0;
        } catch {
            songCount = 0;
            bandCount = 0;
        }
    }
    if (chordSongCount === null) {
        chordSongCount = songCount;
    }
    if (chordBandCount === null) {
        chordBandCount = bandCount;
    }

    return {
        layerId,
        packName,
        schemaVersion,
        generatedAt,
        gitCommit,
        songCount,
        chordSongCount,
        bandCount,
        chordBandCount,
    };
}

export function mergeDatabasesInPriorityOrder(SQL, sourceDbs, mergedId = 'merged') {
    const outDb = new SQL.Database();
    outDb.run(SCHEMA_SQL);

    const bandNameToId = new Map();
    const playlistNameToId = new Map();
    const seenSongKeys = new Set();
    const seenPlaylistSongs = new Set();
    const collectedRules = [];
    const seenRules = new Set();

    const getOrCreateBandId = (name) => {
        const clean = (name || '').trim();
        const key = normalizeTextKey(clean);
        if (bandNameToId.has(key)) {
            return bandNameToId.get(key);
        }
        outDb.run('INSERT INTO bands (name, has_chords, search_norm) VALUES (?, 1, ?);', [
            clean,
            normalizeSearchText(clean),
        ]);
        const newId = queryObjects(outDb, 'SELECT last_insert_rowid() AS id;')[0].id;
        bandNameToId.set(key, newId);
        return newId;
    };

    const getOrCreatePlaylistId = (name) => {
        const clean = (name || '').trim();
        const key = normalizeTextKey(clean);
        if (playlistNameToId.has(key)) {
            return playlistNameToId.get(key);
        }
        outDb.run('INSERT INTO playlists (name, search_norm) VALUES (?, ?);', [
            clean,
            normalizeSearchText(clean),
        ]);
        const newId = queryObjects(outDb, 'SELECT last_insert_rowid() AS id;')[0].id;
        playlistNameToId.set(key, newId);
        return newId;
    };

    const addSongToPlaylist = (playlistId, songId) => {
        const relKey = `${playlistId}:${songId}`;
        if (seenPlaylistSongs.has(relKey)) {
            return;
        }
        seenPlaylistSongs.add(relKey);
        outDb.run('INSERT INTO playlists_songs (playlist_id, song_id) VALUES (?, ?);', [
            playlistId,
            songId,
        ]);
    };

    outDb.run('BEGIN TRANSACTION;');

    for (const srcDb of sourceDbs) {
        try {
            const rules = queryObjects(
                srcDb,
                'SELECT playlist_name, match_pattern FROM playlist_rules;'
            );
            for (const r of rules) {
                const rk = `${normalizeTextKey(r.playlist_name)}|${r.match_pattern}`;
                if (!seenRules.has(rk)) {
                    seenRules.add(rk);
                    collectedRules.push(r);
                    outDb.run(
                        'INSERT INTO playlist_rules (playlist_name, match_pattern) VALUES (?, ?);',
                        [r.playlist_name, r.match_pattern]
                    );
                }
            }
        } catch {
            // DB might not have playlist_rules table
        }

        const srcPlaylists = queryObjects(srcDb, 'SELECT id, name FROM playlists;');
        const srcPlaylistIdToName = new Map();
        for (const pl of srcPlaylists) {
            srcPlaylistIdToName.set(pl.id, pl.name);
            getOrCreatePlaylistId(pl.name);
        }

        const srcBands = queryObjects(srcDb, 'SELECT id, name FROM bands;');
        const srcBandIdToName = new Map();
        for (const b of srcBands) {
            srcBandIdToName.set(b.id, b.name);
        }

        const srcFtRels = queryObjects(
            srcDb,
            'SELECT song_id, ft_band_id FROM songs_ft_bands;'
        );
        const songIdToFtBandNames = new Map();
        for (const rel of srcFtRels) {
            const ftName = srcBandIdToName.get(rel.ft_band_id);
            if (!ftName) continue;
            if (!songIdToFtBandNames.has(rel.song_id)) {
                songIdToFtBandNames.set(rel.song_id, []);
            }
            songIdToFtBandNames.get(rel.song_id).push(ftName);
        }

        const srcPlRels = queryObjects(
            srcDb,
            'SELECT playlist_id, song_id FROM playlists_songs;'
        );
        const songIdToPlaylistNames = new Map();
        for (const rel of srcPlRels) {
            const plName = srcPlaylistIdToName.get(rel.playlist_id);
            if (!plName) continue;
            if (!songIdToPlaylistNames.has(rel.song_id)) {
                songIdToPlaylistNames.set(rel.song_id, []);
            }
            songIdToPlaylistNames.get(rel.song_id).push(plName);
        }

        const srcSongs = queryObjects(srcDb, 'SELECT * FROM songs;');
        const srcSongKeyToNewSongId = new Map();

        for (const s of srcSongs) {
            const bandName = srcBandIdToName.get(s.band_id) || 'Unknown';
            const dedupeKey = `${normalizeTextKey(bandName)}::${normalizeTextKey(s.name)}`;

            if (seenSongKeys.has(dedupeKey)) {
                const existingSongId = srcSongKeyToNewSongId.get(dedupeKey);
                if (existingSongId) {
                    const pls = songIdToPlaylistNames.get(s.id) || [];
                    for (const plName of pls) {
                        const targetPlId = getOrCreatePlaylistId(plName);
                        addSongToPlaylist(targetPlId, existingSongId);
                    }
                }
                continue;
            }

            const newBandId = getOrCreateBandId(bandName);
            const ftNames = songIdToFtBandNames.get(s.id) || [];
            const songSearchNorm = normalizeSearchText(
                `${bandName} ${ftNames.join(' ')} ${s.name} ${s.album || ''}`
            );

            const originId = s.origin_id ?? 0;
            const hasChords =
                s.has_chords !== undefined && s.has_chords !== null
                    ? Number(s.has_chords)
                    : originId > 0
                      ? hasCrawlerSongAndChords(s.contents ?? '')
                          ? 1
                          : 0
                      : 1;

            outDb.run(
                `INSERT INTO songs (
                    content_hash, name, band_id, origin_id, has_chords, search_norm, album, author, bpm, capo,
                    falsetto, highest, init_note, isrc, key, lang, license, musicians,
                    spotify, time_signature, track, url, writer, contents
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                [
                    s.content_hash ?? null,
                    s.name,
                    newBandId,
                    originId,
                    hasChords,
                    songSearchNorm,
                    s.album ?? null,
                    s.author ?? null,
                    s.bpm ?? null,
                    s.capo ?? null,
                    s.falsetto ?? null,
                    s.highest ?? null,
                    s.init_note ?? null,
                    s.isrc ?? null,
                    s.key ?? null,
                    s.lang ?? null,
                    s.license ?? null,
                    s.musicians ?? null,
                    s.spotify ?? null,
                    s.time_signature ?? null,
                    s.track ?? null,
                    s.url ?? null,
                    s.writer ?? null,
                    s.contents ?? '',
                ]
            );
            const newSongId = queryObjects(outDb, 'SELECT last_insert_rowid() AS id;')[0].id;
            seenSongKeys.add(dedupeKey);
            srcSongKeyToNewSongId.set(dedupeKey, newSongId);

            for (const ftName of ftNames) {
                const newFtBandId = getOrCreateBandId(ftName);
                outDb.run('INSERT INTO songs_ft_bands (song_id, ft_band_id) VALUES (?, ?);', [
                    newSongId,
                    newFtBandId,
                ]);
            }

            const pls = songIdToPlaylistNames.get(s.id) || [];
            for (const plName of pls) {
                const targetPlId = getOrCreatePlaylistId(plName);
                addSongToPlaylist(targetPlId, newSongId);
            }
        }
    }

    if (collectedRules.length > 0) {
        const allMergedSongs = queryObjects(
            outDb,
            'SELECT songs.id AS id, songs.name AS sname, bands.name AS bname FROM songs JOIN bands ON songs.band_id = bands.id;'
        );
        for (const rule of collectedRules) {
            const regex = wildcardToRegExp(rule.match_pattern);
            const matchedSongs = allMergedSongs.filter((row) =>
                regex.test(`${row.bname} - ${row.sname}`)
            );
            if (matchedSongs.length > 0) {
                const plId = getOrCreatePlaylistId(rule.playlist_name);
                for (const m of matchedSongs) {
                    addSongToPlaylist(plId, m.id);
                }
            }
        }
    }

    outDb.run(INDEX_SQL);
    outDb.run(UPDATE_BANDS_HAS_CHORDS_SQL);
    populateDatabaseMeta(outDb, { layerId: mergedId, packName: mergedId });
    outDb.run('COMMIT;');

    return outDb;
}
