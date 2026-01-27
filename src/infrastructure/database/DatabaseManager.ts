import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { getDbPath, ensureSimiloDir } from '../../domain/model/Config.js';
import logger from '../logger/index.js';

let db: Database.Database | null = null;

const SCHEMA = `
    CREATE TABLE IF NOT EXISTS index_entries (
        id TEXT PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        content TEXT NOT NULL,
        indexed_at TEXT NOT NULL,
        file_modified_at TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        rowid_vec INTEGER
    );

    CREATE TABLE IF NOT EXISTS directories (
        id TEXT PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        added_at TEXT NOT NULL,
        file_count INTEGER DEFAULT 0,
        last_indexed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_entries_path ON index_entries(path);
    CREATE INDEX IF NOT EXISTS idx_directories_path ON directories(path);
`;

export function getDatabase(): Database.Database {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}

export function initDatabase(dbPath?: string): Database.Database {
    if (db) {
        return db;
    }

    ensureSimiloDir();
    const path = dbPath || getDbPath();

    logger.debug(`Initializing database at ${path}`);

    db = new Database(path);

    // Load sqlite-vec extension
    sqliteVec.load(db);
    logger.debug('sqlite-vec extension loaded');

    // Create vector table
    // nomic-embed-text produces 768-dimensional vectors
    db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_index USING vec0(
            embedding float[768]
        );
    `);

    // Create regular tables
    db.exec(SCHEMA);

    logger.info(`Database initialized at ${path}`);

    return db;
}

export function closeDatabase(): void {
    if (db) {
        db.close();
        db = null;
        logger.debug('Database closed');
    }
}

export function resetDatabase(): void {
    if (db) {
        db.exec('DROP TABLE IF EXISTS index_entries');
        db.exec('DROP TABLE IF EXISTS directories');
        db.exec('DROP TABLE IF EXISTS vec_index');
        db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS vec_index USING vec0(
                embedding float[768]
            );
        `);
        db.exec(SCHEMA);
        logger.info('Database reset');
    }
}
