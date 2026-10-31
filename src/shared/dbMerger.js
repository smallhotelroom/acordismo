/**
 * @file src/shared/dbMerger.js
 * @version 1.0.0
 */

export const __version__ = '1.0.0';

export const SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS meta (
        key VARCHAR PRIMARY KEY,
        value VARCHAR
    );
    CREATE TABLE IF NOT EXISTS songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_hash VARCHAR,
        name VARCHAR,
        band_id INTEGER,
        origin_id INTEGER DEFAULT 0,
        album VARCHAR,
        author VARCHAR,
        bpm REAL,
        capo INTEGER,
        falsetto VARCHAR,
        highest VARCHAR,
        isrc VARCHAR,
        key VARCHAR,
        lang VARCHAR,
        license VARCHAR,
        musicians VARCHAR,
        spotify VARCHAR,
        time_signature VARCHAR,
        track INTEGER,
        url VARCHAR,
        writer VARCHAR,
        contents VARCHAR
    );
    CREATE TABLE IF NOT EXISTS bands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR
    );
    CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR
    );
    CREATE TABLE IF NOT EXISTS playlists_songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER,
        song_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS songs_ft_bands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        song_id INTEGER,
        ft_band_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS playlist_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_name VARCHAR,
        match_pattern VARCHAR
    );
`;

export const INDEX_SQL = `
    CREATE INDEX IF NOT EXISTS idx_songs_band_id ON songs(band_id);
    CREATE INDEX IF NOT EXISTS idx_songs_name ON songs(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_bands_name ON bands(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_playlists_songs_pid ON playlists_songs(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_playlists_songs_sid ON playlists_songs(song_id);
    CREATE INDEX IF NOT EXISTS idx_songs_ft_bands_sid ON songs_ft_bands(song_id);
    CREATE INDEX IF NOT EXISTS idx_songs_ft_bands_bid ON songs_ft_bands(ft_band_id);
`;

/**
 * Converts a wildcard pattern like "Small Hotel Room - *" into a case-insensitive RegExp.
 */
export function wildcardToRegExp(pattern) {
    const escaped = String(pattern)
        .trim()
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`, 'i');
}

function queryAll(db, sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

function tableExists(db, tableName) {
    const rows = queryAll(
        db,
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?;",
        [tableName]
    );
    return rows.length > 0;
}

/**
 * Reads metadata and quick stats from an opened sql.js Database instance.
 */
export function inspectDatabase(db, fallbackLabel = 'Database Pack') {
    const metaMap = {};
    if (tableExists(db, 'meta')) {
        for (const row of queryAll(db, 'SELECT key, value FROM meta;')) {
            metaMap[row.key] = row.value;
        }
    }
    const songCount = tableExists(db, 'songs')
        ? (queryAll(db, 'SELECT COUNT(*) AS c FROM songs;')[0]?.c ?? 0)
        : 0;
    const bandCount = tableExists(db, 'bands')
        ? (queryAll(db, 'SELECT COUNT(*) AS c FROM bands;')[0]?.c ?? 0)
        : 0;
    const playlistCount = tableExists(db, 'playlists')
        ? (queryAll(db, 'SELECT COUNT(*) AS c FROM playlists;')[0]?.c ?? 0)
        : 0;

    return {
        layerId: metaMap.layer_id || fallbackLabel,
        generatedAt: metaMap.generated_at || null,
        songCount,
        bandCount,
        playlistCount,
    };
}

/**
 * Merges an ordered array of sql.js Database instances (index 0 = highest priority)
 * into a brand-new sql.js Database instance.
 *
 * - Higher-priority songs override lower-priority duplicates with the same (band_name, song_name).
 * - Overridden songs still inherit playlist memberships from lower-priority layers.
 * - Dynamic wildcard rules in `playlist_rules` are evaluated across the final merged catalog.
 * - Empty bands and empty playlists are never inserted.
 */
export function mergeDatabasesInPriorityOrder(SQL, dbList, label = 'merged') {
    if (!dbList || dbList.length === 0) {
        const emptyDb = new SQL.Database();
        emptyDb.run(SCHEMA_SQL);
        return emptyDb;
    }

    const mergedDb = new SQL.Database();
    mergedDb.run(SCHEMA_SQL);

    // Canonical registries in priority order
    // songKey = `${bandName.toLowerCase()}|||${songName.toLowerCase()}`
    const songsByKey = new Map();
    const playlistOrder = [];
    const playlistOrderSet = new Set();
    const playlistSongsMap = new Map(); // playlistName -> Set(songKey)
    const wildcardRules = []; // { playlist_name, match_pattern }

    const ensurePlaylistRegistered = (pName) => {
        if (!pName) {
            return;
        }
        if (!playlistOrderSet.has(pName)) {
            playlistOrderSet.add(pName);
            playlistOrder.push(pName);
        }
        if (!playlistSongsMap.has(pName)) {
            playlistSongsMap.set(pName, new Set());
        }
    };

    for (const srcDb of dbList) {
        if (!tableExists(srcDb, 'songs') || !tableExists(srcDb, 'bands')) {
            continue;
        }

        const srcBands = new Map();
        for (const b of queryAll(srcDb, 'SELECT id, name FROM bands;')) {
            srcBands.set(b.id, String(b.name || '').trim());
        }

        const srcFtBySong = new Map();
        if (tableExists(srcDb, 'songs_ft_bands')) {
            for (const ft of queryAll(srcDb, 'SELECT song_id, ft_band_id FROM songs_ft_bands;')) {
                const ftName = srcBands.get(ft.ft_band_id);
                if (!ftName) {
                    continue;
                }
                if (!srcFtBySong.has(ft.song_id)) {
                    srcFtBySong.set(ft.song_id, []);
                }
                srcFtBySong.get(ft.song_id).push(ftName);
            }
        }

        const srcPlaylists = new Map();
        if (tableExists(srcDb, 'playlists')) {
            for (const p of queryAll(srcDb, 'SELECT id, name FROM playlists ORDER BY id ASC;')) {
                const pName = String(p.name || '').trim();
                if (pName) {
                    srcPlaylists.set(p.id, pName);
                    ensurePlaylistRegistered(pName);
                }
            }
        }

        const srcSongIdToKey = new Map();
        const srcSongs = queryAll(srcDb, 'SELECT * FROM songs ORDER BY id ASC;');

        for (const s of srcSongs) {
            const bandName = srcBands.get(s.band_id);
            const songName = String(s.name || '').trim();
            if (!bandName || !songName) {
                continue;
            }

            const songKey = `${bandName.toLowerCase()}|||${songName.toLowerCase()}`;
            srcSongIdToKey.set(s.id, songKey);

            // First layer to define (bandName, songName) wins!
            if (!songsByKey.has(songKey)) {
                songsByKey.set(songKey, {
                    ...s,
                    bandName,
                    songName,
                    ftBandNames: srcFtBySong.get(s.id) || [],
                });
            }
        }

        if (tableExists(srcDb, 'playlists_songs')) {
            for (const ps of queryAll(srcDb, 'SELECT playlist_id, song_id FROM playlists_songs;')) {
                const pName = srcPlaylists.get(ps.playlist_id);
                const songKey = srcSongIdToKey.get(ps.song_id);
                if (pName && songKey && songsByKey.has(songKey)) {
                    ensurePlaylistRegistered(pName);
                    playlistSongsMap.get(pName).add(songKey);
                }
            }
        }

        if (tableExists(srcDb, 'playlist_rules')) {
            for (const rule of queryAll(srcDb, 'SELECT playlist_name, match_pattern FROM playlist_rules;')) {
                if (rule.playlist_name && rule.match_pattern) {
                    ensurePlaylistRegistered(rule.playlist_name);
                    wildcardRules.push({
                        playlist_name: rule.playlist_name,
                        match_pattern: rule.match_pattern,
                    });
                }
            }
        }
    }

    // Evaluate wildcard/glob rules across all merged songs (excluding crawler OrigenZK/OrigenLK songs)
    for (const rule of wildcardRules) {
        const regex = wildcardToRegExp(rule.match_pattern);
        const targetSet = playlistSongsMap.get(rule.playlist_name);
        for (const [songKey, songObj] of songsByKey.entries()) {
            if (/\(Origen(ZK|LK)\)$/i.test(songObj.songName)) {
                continue;
            }
            const fullLabel = `${songObj.bandName} - ${songObj.songName}`;
            if (regex.test(fullLabel)) {
                targetSet.add(songKey);
            }
        }
    }

    // Keep "★ ..." curated playlists ordered at the bottom (matching classic Cordismo layout)
    const regularPlaylists = playlistOrder.filter((p) => !p.startsWith('★'));
    const starPlaylists = playlistOrder.filter((p) => p.startsWith('★'));
    const finalPlaylistOrder = [...regularPlaylists, ...starPlaylists];

    mergedDb.run('BEGIN TRANSACTION;');

    const bandIdByLower = new Map();
    const getOrCreateBandId = (bandName) => {
        const clean = String(bandName).trim();
        const key = clean.toLowerCase();
        if (bandIdByLower.has(key)) {
            return bandIdByLower.get(key);
        }
        mergedDb.run('INSERT INTO bands (name) VALUES (?);', [clean]);
        const newId = queryAll(mergedDb, 'SELECT last_insert_rowid() AS id;')[0].id;
        bandIdByLower.set(key, newId);
        return newId;
    };

    const insertSongStmt = mergedDb.prepare(`
        INSERT INTO songs (
            content_hash, name, band_id, origin_id, album, author, bpm, capo,
            falsetto, highest, isrc, key, lang, license, musicians, spotify,
            time_signature, track, url, writer, contents
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    const insertFtStmt = mergedDb.prepare(
        'INSERT INTO songs_ft_bands (song_id, ft_band_id) VALUES (?, ?);'
    );

    const newSongIdByKey = new Map();

    for (const [songKey, s] of songsByKey.entries()) {
        const bandId = getOrCreateBandId(s.bandName);
        insertSongStmt.run([
            s.content_hash ?? null,
            s.songName,
            bandId,
            s.origin_id ?? 0,
            s.album ?? null,
            s.author ?? null,
            s.bpm ?? null,
            s.capo ?? null,
            s.falsetto ?? null,
            s.highest ?? null,
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
        ]);

        const songId = queryAll(mergedDb, 'SELECT last_insert_rowid() AS id;')[0].id;
        newSongIdByKey.set(songKey, songId);

        for (const ftName of s.ftBandNames) {
            const ftBandId = getOrCreateBandId(ftName);
            insertFtStmt.run([songId, ftBandId]);
        }
    }

    insertSongStmt.free();
    insertFtStmt.free();

    const insertPlaylistSongStmt = mergedDb.prepare(
        'INSERT INTO playlists_songs (playlist_id, song_id) VALUES (?, ?);'
    );

    for (const pName of finalPlaylistOrder) {
        const songKeys = playlistSongsMap.get(pName);
        if (!songKeys || songKeys.size === 0) {
            continue;
        }
        mergedDb.run('INSERT INTO playlists (name) VALUES (?);', [pName]);
        const playlistId = queryAll(mergedDb, 'SELECT last_insert_rowid() AS id;')[0].id;

        for (const sKey of songKeys) {
            const songId = newSongIdByKey.get(sKey);
            if (songId) {
                insertPlaylistSongStmt.run([playlistId, songId]);
            }
        }
    }

    insertPlaylistSongStmt.free();

    for (const rule of wildcardRules) {
        mergedDb.run(
            'INSERT INTO playlist_rules (playlist_name, match_pattern) VALUES (?, ?);',
            [rule.playlist_name, rule.match_pattern]
        );
    }

    mergedDb.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?);', ['layer_id', label]);
    mergedDb.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?);', [
        'generated_at',
        new Date().toISOString(),
    ]);

    mergedDb.run(INDEX_SQL);
    mergedDb.run('COMMIT;');

    return mergedDb;
}
