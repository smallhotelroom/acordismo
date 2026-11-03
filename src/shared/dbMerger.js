/**
 * @file src/shared/dbMerger.js
 * @version 1.3.0
 */

export const __version__ = '1.3.0';

/**
 * Strips diacritics/accents (e.g. "Leãozinho" -> "leaozinho", "Español" -> "espanol")
 * and normalizes whitespace to lowercase for instant accent-insensitive multi-token search.
 */
export function normalizeSearchText(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Splits a user's search query into normalized diacritic-free tokens.
 * Example: "Caetano  Leãozinho" -> ["caetano", "leaozinho"]
 */
export function tokenizeSearchQuery(queryStr) {
    const norm = normalizeSearchText(queryStr);
    return norm ? norm.split(' ').filter(Boolean) : [];
}

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
);
CREATE TABLE IF NOT EXISTS bands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_bands_search_norm ON bands (search_norm);
CREATE INDEX IF NOT EXISTS idx_playlists_name ON playlists (name);
CREATE INDEX IF NOT EXISTS idx_playlists_search_norm ON playlists (search_norm);
CREATE INDEX IF NOT EXISTS idx_songs_name ON songs (name);
CREATE INDEX IF NOT EXISTS idx_songs_band_id ON songs (band_id);
CREATE INDEX IF NOT EXISTS idx_songs_hash ON songs (content_hash);
CREATE INDEX IF NOT EXISTS idx_songs_search_norm ON songs (search_norm);
CREATE INDEX IF NOT EXISTS idx_playlists_songs_playlist_id ON playlists_songs (playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlists_songs_song_id ON playlists_songs (song_id);
CREATE INDEX IF NOT EXISTS idx_songs_ft_bands_song_id ON songs_ft_bands (song_id);
CREATE INDEX IF NOT EXISTS idx_songs_ft_bands_ft_band_id ON songs_ft_bands (ft_band_id);
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

export function inspectDatabase(db, fallbackName = 'custom') {
    let layerId = fallbackName;
    let songCount = 0;
    let bandCount = 0;
    try {
        const metaRows = queryObjects(db, "SELECT value FROM meta WHERE key = 'layer_id';");
        if (metaRows.length > 0 && metaRows[0].value) {
            layerId = metaRows[0].value;
        }
    } catch {
        // Older DB without meta table
    }
    try {
        songCount = queryObjects(db, 'SELECT COUNT(*) AS c FROM songs;')[0]?.c || 0;
        bandCount = queryObjects(db, 'SELECT COUNT(*) AS c FROM bands;')[0]?.c || 0;
    } catch {
        // Ignore
    }
    return { layerId, songCount, bandCount };
}

/**
 * Merges an ordered array of SQL.Database instances (Priority #1 first, lowest priority last)
 * into a brand new SQL.Database instance, populating search_norm automatically.
 */
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
        outDb.run('INSERT INTO bands (name, search_norm) VALUES (?, ?);', [
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
            const songSearchNorm =
                s.search_norm ||
                normalizeSearchText(`${bandName} ${ftNames.join(' ')} ${s.name} ${s.album || ''}`);

            outDb.run(
                `INSERT INTO songs (
                    content_hash, name, band_id, origin_id, search_norm, album, author, bpm, capo,
                    falsetto, highest, init_note, isrc, key, lang, license, musicians,
                    spotify, time_signature, track, url, writer, contents
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                [
                    s.content_hash ?? null,
                    s.name,
                    newBandId,
                    s.origin_id ?? 0,
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

    outDb.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?);', [
        'layer_id',
        mergedId,
    ]);
    outDb.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?);', [
        'generated_at',
        new Date().toISOString(),
    ]);
    outDb.run(INDEX_SQL);
    outDb.run('COMMIT;');

    return outDb;
}
