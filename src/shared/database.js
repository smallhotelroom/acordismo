/**
 * @file src/shared/database.js
 * @version 3.8.0
 */
import * as sqlJsModule from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import {
    DB_SCHEMA_VERSION,
    INDEX_SQL,
    UPDATE_BANDS_HAS_CHORDS_SQL,
    inspectDatabase,
    mergeDatabasesInPriorityOrder,
    populateDatabaseMeta,
} from './dbMerger';

export const __version__ = '3.8.0';

const initSqlJs = sqlJsModule.default || sqlJsModule;

const IDB_NAME = 'shr_storage';
const IDB_STORE = 'db_packs';
const IDB_KEY_STACK = 'db_layer_stack_v1';
const IDB_KEY_MERGED_CACHE = 'db_merged_cache_v1';
const IDB_KEY_ACTIVE_LABEL = 'db_active_label_v1';

let sqlPromise = null;
let dbInstance = null;
let initPromise = null;
let cachedDefaultBytes = null;

function openIdb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(IDB_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idbGet(key) {
    try {
        const db = await openIdb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).get(key);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        console.error('IndexedDB read error:', err);
        return null;
    }
}

async function idbSet(key, value) {
    try {
        const db = await openIdb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(value, key);
            tx.oncomplete = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        console.error('IndexedDB write error:', err);
    }
}

async function idbDelete(key) {
    try {
        const db = await openIdb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).delete(key);
            tx.oncomplete = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        console.error('IndexedDB delete error:', err);
    }
}

async function idbClear() {
    try {
        const db = await openIdb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).clear();
            tx.oncomplete = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        console.error('IndexedDB clear error:', err);
    }
}

async function getSqlEngine() {
    if (!sqlPromise) {
        sqlPromise = initSqlJs({
            locateFile: () => sqlWasmUrl,
        });
    }
    return sqlPromise;
}

async function fetchDefaultDbBytes() {
    if (cachedDefaultBytes) {
        return cachedDefaultBytes;
    }
    const response = await fetch('/songs.db');
    if (!response.ok) {
        throw new Error(`Failed to load /songs.db: ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    cachedDefaultBytes = new Uint8Array(buffer);
    return cachedDefaultBytes;
}

function ensureSchemaColumns(db) {
    if (!db) return db;
    try {
        const stmt = db.prepare("SELECT value FROM meta WHERE key = 'schema_version';");
        const isCurrent = stmt.step() && stmt.getAsObject().value === DB_SCHEMA_VERSION;
        stmt.free();
        if (isCurrent) {
            return db;
        }
    } catch {}

    db.run('BEGIN TRANSACTION;');
    try {
        db.run('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);');
    } catch {}
    try {
        db.run('ALTER TABLE songs ADD COLUMN has_chords INTEGER NOT NULL DEFAULT 1;');
    } catch {}
    try {
        db.run('ALTER TABLE bands ADD COLUMN has_chords INTEGER NOT NULL DEFAULT 1;');
    } catch {}
    try {
        db.run('ALTER TABLE bands ADD COLUMN search_norm TEXT;');
    } catch {}
    try {
        db.run('ALTER TABLE playlists ADD COLUMN search_norm TEXT;');
    } catch {}
    try {
        db.run('ALTER TABLE songs ADD COLUMN search_norm TEXT;');
    } catch {}
    try {
        db.run('ALTER TABLE songs ADD COLUMN tuning TEXT;');
    } catch {}

    db.run(
        "UPDATE bands SET search_norm = REPLACE(LOWER(COALESCE(search_norm, name)), '''', '');"
    );
    db.run(
        "UPDATE playlists SET search_norm = REPLACE(LOWER(COALESCE(search_norm, name)), '''', '');"
    );
    db.run(
        "UPDATE songs SET search_norm = REPLACE(LOWER(COALESCE(search_norm, name)), '''', '');"
    );

    db.run(INDEX_SQL);
    db.run(UPDATE_BANDS_HAS_CHORDS_SQL);
    populateDatabaseMeta(db);
    db.run('COMMIT;');
    return db;
}

function computeStackLabel(stack) {
    const enabled = (stack || []).filter((l) => l.enabled);
    if (enabled.length === 0) {
        return 'None (All Layers Disabled)';
    }
    if (enabled.length === 1 && enabled[0].builtin) {
        return 'Default (Small Hotel Room)';
    }
    return enabled.map((l, idx) => `#${idx + 1} ${l.name}`).join(' + ');
}

export async function getDatabaseLayerStack() {
    let stack = await idbGet(IDB_KEY_STACK);

    if (!Array.isArray(stack) || stack.length === 0) {
        const SQL = await getSqlEngine();
        const defaultBytes = await fetchDefaultDbBytes();
        const tmpDb = new SQL.Database(defaultBytes);
        const stats = inspectDatabase(tmpDb, 'official');
        tmpDb.close();

        stack = [
            {
                id: 'builtin-official',
                name: 'Official (Small Hotel Room)',
                builtin: true,
                enabled: true,
                songCount: stats.songCount,
                chordSongCount: stats.chordSongCount,
                bandCount: stats.bandCount,
                chordBandCount: stats.chordBandCount,
                generatedAt: stats.generatedAt,
                gitCommit: stats.gitCommit,
                schemaVersion: stats.schemaVersion,
                bytes: null,
            },
        ];

        await idbSet(IDB_KEY_STACK, stack);
        await idbSet(IDB_KEY_ACTIVE_LABEL, computeStackLabel(stack));
    } else if (stack[0]?.builtin && !stack[0]?.generatedAt) {
        const SQL = await getSqlEngine();
        const defaultBytes = await fetchDefaultDbBytes();
        const tmpDb = new SQL.Database(defaultBytes);
        const stats = inspectDatabase(tmpDb, 'official');
        tmpDb.close();
        stack[0] = {
            ...stack[0],
            songCount: stats.songCount,
            chordSongCount: stats.chordSongCount,
            bandCount: stats.bandCount,
            chordBandCount: stats.chordBandCount,
            generatedAt: stats.generatedAt,
            gitCommit: stats.gitCommit,
            schemaVersion: stats.schemaVersion,
        };
        await idbSet(IDB_KEY_STACK, stack);
    }

    return stack;
}

export async function getSavedDbLabel() {
    const cachedLabel = await idbGet(IDB_KEY_ACTIVE_LABEL);
    if (cachedLabel) {
        return cachedLabel;
    }
    const stack = await getDatabaseLayerStack();
    const label = computeStackLabel(stack);
    await idbSet(IDB_KEY_ACTIVE_LABEL, label);
    return label;
}

export async function rebuildMergedDatabase(providedStack = null) {
    const SQL = await getSqlEngine();
    const stack = providedStack || (await getDatabaseLayerStack());
    const enabledLayers = stack.filter((l) => l.enabled);

    await idbSet(IDB_KEY_ACTIVE_LABEL, computeStackLabel(stack));

    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }

    if (enabledLayers.length === 1 && enabledLayers[0].builtin) {
        await idbDelete(IDB_KEY_MERGED_CACHE);
        const defaultBytes = await fetchDefaultDbBytes();
        dbInstance = ensureSchemaColumns(new SQL.Database(defaultBytes));
        return dbInstance;
    }

    if (enabledLayers.length === 1 && !enabledLayers[0].builtin && enabledLayers[0].bytes) {
        const singleBytes = enabledLayers[0].bytes;
        dbInstance = ensureSchemaColumns(new SQL.Database(singleBytes));
        await idbSet(IDB_KEY_MERGED_CACHE, dbInstance.export());
        return dbInstance;
    }

    const openedDbs = [];
    try {
        for (const layer of enabledLayers) {
            const bytes = layer.builtin ? await fetchDefaultDbBytes() : layer.bytes;
            if (bytes) {
                openedDbs.push(new SQL.Database(bytes));
            }
        }
        dbInstance = mergeDatabasesInPriorityOrder(SQL, openedDbs, 'runtime-merged');
        const exportedMerged = dbInstance.export();
        await idbSet(IDB_KEY_MERGED_CACHE, exportedMerged);
    } finally {
        for (const d of openedDbs) {
            d.close();
        }
    }

    return dbInstance;
}

export async function initDatabase(customUint8Array = null) {
    const SQL = await getSqlEngine();

    if (customUint8Array) {
        if (dbInstance) {
            dbInstance.close();
        }
        dbInstance = ensureSchemaColumns(new SQL.Database(customUint8Array));
        return dbInstance;
    }

    if (dbInstance) {
        return dbInstance;
    }

    if (!initPromise) {
        initPromise = (async () => {
            const cachedMergedBytes = await idbGet(IDB_KEY_MERGED_CACHE);
            if (cachedMergedBytes && cachedMergedBytes instanceof Uint8Array) {
                dbInstance = ensureSchemaColumns(new SQL.Database(cachedMergedBytes));
                return dbInstance;
            }

            const stack = await idbGet(IDB_KEY_STACK);
            if (Array.isArray(stack) && stack.length > 0) {
                const enabled = stack.filter((l) => l.enabled);
                if (enabled.length === 1 && enabled[0].builtin) {
                    const defaultBytes = await fetchDefaultDbBytes();
                    dbInstance = ensureSchemaColumns(new SQL.Database(defaultBytes));
                    return dbInstance;
                }
                return await rebuildMergedDatabase(stack);
            }

            const defaultBytes = await fetchDefaultDbBytes();
            dbInstance = ensureSchemaColumns(new SQL.Database(defaultBytes));
            return dbInstance;
        })().finally(() => {
            initPromise = null;
        });
    }

    return initPromise;
}

export async function loadExternalDatabaseBytes(bytes, fileName = 'shared-pack.db') {
    const SQL = await getSqlEngine();
    const testDb = ensureSchemaColumns(new SQL.Database(bytes));
    const stats = inspectDatabase(testDb, fileName);
    const upgradedBytes = testDb.export();
    testDb.close();

    const stack = await getDatabaseLayerStack();
    const existingIdx = stack.findIndex((l) => !l.builtin && l.name === fileName);

    const layerEntry = {
        id:
            existingIdx !== -1
                ? stack[existingIdx].id
                : `layer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: fileName,
        builtin: false,
        enabled: true,
        songCount: stats.songCount,
        chordSongCount: stats.chordSongCount,
        bandCount: stats.bandCount,
        chordBandCount: stats.chordBandCount,
        generatedAt: stats.generatedAt,
        gitCommit: stats.gitCommit,
        schemaVersion: stats.schemaVersion,
        bytes: upgradedBytes,
    };

    if (existingIdx !== -1) {
        stack[existingIdx] = layerEntry;
    } else {
        stack.push(layerEntry);
    }

    await idbSet(IDB_KEY_STACK, stack);
    await rebuildMergedDatabase(stack);
    return stack;
}

export async function loadExternalDatabaseFile(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    return await loadExternalDatabaseBytes(bytes, file.name);
}

export async function toggleDatabaseLayer(layerId) {
    const stack = await getDatabaseLayerStack();
    const nextStack = stack.map((l) =>
        l.id === layerId ? { ...l, enabled: !l.enabled } : l
    );
    await idbSet(IDB_KEY_STACK, nextStack);
    await rebuildMergedDatabase(nextStack);
    return nextStack;
}

export async function moveDatabaseLayer(layerId, direction) {
    const stack = await getDatabaseLayerStack();
    const idx = stack.findIndex((l) => l.id === layerId);
    if (idx === -1) {
        return stack;
    }
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= stack.length) {
        return stack;
    }
    const nextStack = [...stack];
    const [moved] = nextStack.splice(idx, 1);
    nextStack.splice(targetIdx, 0, moved);

    await idbSet(IDB_KEY_STACK, nextStack);
    await rebuildMergedDatabase(nextStack);
    return nextStack;
}

export async function removeDatabaseLayer(layerId) {
    const stack = await getDatabaseLayerStack();
    const nextStack = stack.filter((l) => l.builtin || l.id !== layerId);
    await idbSet(IDB_KEY_STACK, nextStack);
    await rebuildMergedDatabase(nextStack);
    return nextStack;
}

export async function resetToDefaultDatabase() {
    await idbClear();
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }
    await initDatabase();
}

const executeQuery = async (sql, params = []) => {
    try {
        const db = await initDatabase();
        const stmt = db.prepare(sql);
        stmt.bind(params);

        const rowsArray = [];
        while (stmt.step()) {
            rowsArray.push(stmt.getAsObject());
        }
        stmt.free();

        return {
            rows: {
                length: rowsArray.length,
                _array: rowsArray,
                item: (index) => rowsArray[index],
            },
        };
    } catch (err) {
        console.error('SQLite executeQuery error:', sql, params, err);
        throw err;
    }
};

export default executeQuery;
