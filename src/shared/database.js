/**
 * @file src/shared/database.js
 * @version 2.3.0
 */
import * as sqlJsModule from 'sql.js';

export const __version__ = '2.3.0';

const initSqlJs = sqlJsModule.default || sqlJsModule;

const IDB_NAME = 'acordismo_storage';
const IDB_STORE = 'db_packs';
const IDB_KEY_BYTES = 'custom_db_bytes';
const IDB_KEY_LABEL = 'custom_db_label';

let sqlPromise = null;
let dbInstance = null;

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

export async function getSavedDbLabel() {
    const label = await idbGet(IDB_KEY_LABEL);
    return label || 'Default (Small Hotel Room)';
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

    if (!dbInstance) {
        // 1. Check if the user previously saved an external .db pack in IndexedDB
        const savedBytes = await idbGet(IDB_KEY_BYTES);
        if (savedBytes && savedBytes instanceof Uint8Array) {
            dbInstance = new SQL.Database(savedBytes);
            return dbInstance;
        }

        // 2. Otherwise load the clean bundled /songs.db
        const response = await fetch('/songs.db');
        if (!response.ok) {
            throw new Error(`Failed to load /songs.db: ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();
        dbInstance = new SQL.Database(new Uint8Array(buffer));
    }

    return dbInstance;
}

/**
 * Loads an external .db SQLite file selected by the user and persists it in IndexedDB
 */
export async function loadExternalDatabaseFile(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    await initDatabase(bytes);
    await idbSet(IDB_KEY_BYTES, bytes);
    await idbSet(IDB_KEY_LABEL, file.name);
}

/**
 * Clears any saved external .db from IndexedDB and resets to the bundled clean /songs.db
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
