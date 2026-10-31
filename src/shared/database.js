/**
 * @file src/shared/database.js
 * @version 3.1.0
 */
import * as sqlJsModule from 'sql.js';
import { inspectDatabase, mergeDatabasesInPriorityOrder } from './dbMerger';

export const __version__ = '3.1.0';

const initSqlJs = sqlJsModule.default || sqlJsModule;

const IDB_NAME = 'acordismo_storage';
const IDB_STORE = 'db_packs';
const IDB_KEY_STACK = 'db_layer_stack_v1';
const IDB_KEY_MERGED_CACHE = 'db_merged_cache_v1';
const IDB_KEY_ACTIVE_LABEL = 'db_active_label_v1';

// Legacy single-pack keys (migrated automatically if present)
const LEGACY_KEY_BYTES = 'custom_db_bytes';
const LEGACY_KEY_LABEL = 'custom_db_label';

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
            tx.onerror = () => reject(tx.error);
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
            tx.onerror = () => reject(tx.error);
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
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.error('IndexedDB clear error:', err);
    }
}

async function getSqlEngine() {
    if (!sqlPromise) {
        sqlPromise = initSqlJs({
            locateFile: () => '/sql-wasm.wasm',
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

/**
 * Returns the persisted N-layer stack from IndexedDB, initializing with the built-in
 * official pack at Priority 1 if no stack is stored yet.
 */
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
                bandCount: stats.bandCount,
                bytes: null,
            },
        ];

        // Migrate legacy custom DB if user had one loaded previously
        const legacyBytes = await idbGet(LEGACY_KEY_BYTES);
        const legacyLabel = await idbGet(LEGACY_KEY_LABEL);
        if (legacyBytes && legacyBytes instanceof Uint8Array) {
            const legacyDb = new SQL.Database(legacyBytes);
            const lStats = inspectDatabase(legacyDb, legacyLabel || 'Custom Pack');
            legacyDb.close();
            stack.push({
                id: `layer-${Date.now()}`,
                name: legacyLabel || 'Custom Pack',
                builtin: false,
                enabled: true,
                songCount: lStats.songCount,
                bandCount: lStats.bandCount,
                bytes: legacyBytes,
            });
        }

        await idbSet(IDB_KEY_STACK, stack);
        await idbSet(IDB_KEY_ACTIVE_LABEL, computeStackLabel(stack));
    }

    return stack;
}

/**
 * Fast label lookup that avoids loading multi-megabyte Uint8Array layer packs on app boot.
 */
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

/**
 * Rebuilds the active in-memory SQLite database by merging all enabled layers in priority order,
 * and caches the resulting merged binary in IndexedDB for instant startup on future launches.
 */
export async function rebuildMergedDatabase(providedStack = null) {
    const SQL = await getSqlEngine();
    const stack = providedStack || (await getDatabaseLayerStack());
    const enabledLayers = stack.filter((l) => l.enabled);

    await idbSet(IDB_KEY_ACTIVE_LABEL, computeStackLabel(stack));

    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }

    // Fast path 1: Only the built-in official layer is active
    if (enabledLayers.length === 1 && enabledLayers[0].builtin) {
        await idbDelete(IDB_KEY_MERGED_CACHE);
        const defaultBytes = await fetchDefaultDbBytes();
        dbInstance = new SQL.Database(defaultBytes);
        return dbInstance;
    }

    // Fast path 2: Only a single external layer is active (no cross-layer merging needed)
    if (enabledLayers.length === 1 && !enabledLayers[0].builtin && enabledLayers[0].bytes) {
        const singleBytes = enabledLayers[0].bytes;
        await idbSet(IDB_KEY_MERGED_CACHE, singleBytes);
        dbInstance = new SQL.Database(singleBytes);
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
        dbInstance = new SQL.Database(customUint8Array);
        return dbInstance;
    }

    if (dbInstance) {
        return dbInstance;
    }

    // Prevent concurrent queries on HomeScreen mount from triggering duplicate initializations
    if (!initPromise) {
        initPromise = (async () => {
            // 1. Check if we already have a pre-merged database binary cached in IndexedDB
            const cachedMergedBytes = await idbGet(IDB_KEY_MERGED_CACHE);
            if (cachedMergedBytes && cachedMergedBytes instanceof Uint8Array) {
                dbInstance = new SQL.Database(cachedMergedBytes);
                return dbInstance;
            }

            // 2. Check if the user has custom layers configured without a cache yet
            const stack = await idbGet(IDB_KEY_STACK);
            if (Array.isArray(stack) && stack.length > 0) {
                const enabled = stack.filter((l) => l.enabled);
                if (enabled.length === 1 && enabled[0].builtin) {
                    const defaultBytes = await fetchDefaultDbBytes();
                    dbInstance = new SQL.Database(defaultBytes);
                    return dbInstance;
                }
                return await rebuildMergedDatabase(stack);
            }

            // 3. Default clean startup: load bundled /songs.db directly with zero IndexedDB blob writes
            const defaultBytes = await fetchDefaultDbBytes();
            dbInstance = new SQL.Database(defaultBytes);
            return dbInstance;
        })().finally(() => {
            initPromise = null;
        });
    }

    return initPromise;
}

/**
 * Adds or updates an external .db pack in the N-Layer Priority Stack and rebuilds the merged DB.
 */
export async function loadExternalDatabaseFile(file) {
    const SQL = await getSqlEngine();
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    const testDb = new SQL.Database(bytes);
    const stats = inspectDatabase(testDb, file.name);
    testDb.close();

    const stack = await getDatabaseLayerStack();
    const existingIdx = stack.findIndex((l) => !l.builtin && l.name === file.name);

    const layerEntry = {
        id:
            existingIdx !== -1
                ? stack[existingIdx].id
                : `layer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        builtin: false,
        enabled: true,
        songCount: stats.songCount,
        bandCount: stats.bandCount,
        bytes,
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

/**
 * Toggles a layer ON/OFF by ID.
 */
export async function toggleDatabaseLayer(layerId) {
    const stack = await getDatabaseLayerStack();
    const nextStack = stack.map((l) =>
        l.id === layerId ? { ...l, enabled: !l.enabled } : l
    );
    await idbSet(IDB_KEY_STACK, nextStack);
    await rebuildMergedDatabase(nextStack);
    return nextStack;
}

/**
 * Moves a layer up (-1) or down (+1) in the priority stack.
 */
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

/**
 * Removes a user-loaded layer from the priority stack.
 */
export async function removeDatabaseLayer(layerId) {
    const stack = await getDatabaseLayerStack();
    const nextStack = stack.filter((l) => l.builtin || l.id !== layerId);
    await idbSet(IDB_KEY_STACK, nextStack);
    await rebuildMergedDatabase(nextStack);
    return nextStack;
}

/**
 * Clears all custom .db layers and resets to the built-in official database.
 */
export async function resetToDefaultDatabase() {
    await idbClear();
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }
    await initDatabase();
}

/**
 * Executes a parameterized SQLite query and returns a backwards-compatible
 * { rows: { length, item(i), _array } } object matching Cordismo's interface.
 */
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
