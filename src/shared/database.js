/**
 * @file src/shared/database.js
 * @version 2.1.0
 */
import initSqlJs from 'sql.js';

export const __version__ = '2.1.0';

let sqlPromise = null;
let dbInstance = null;

async function getSqlEngine() {
    if (!sqlPromise) {
        sqlPromise = initSqlJs({
            locateFile: () => '/sql-wasm.wasm',
        });
    }
    return sqlPromise;
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
 * Loads an external .db SQLite file selected by the user (e.g. from disk/phone)
 */
export async function loadExternalDatabaseFile(file) {
    const buffer = await file.arrayBuffer();
    await initDatabase(new Uint8Array(buffer));
}

/**
 * Resets back to the bundled clean /songs.db
 */
export async function resetToDefaultDatabase() {
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
