import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { getDbPath, ensureSimiloDir } from '../../domain/model/Config.js';
import logger from '../logger/index.js';

export interface EmbeddingMetadata {
    modelName: string;
    dimensions: number;
    createdAt: Date;
}

let db: Database.Database | null = null;

const METADATA_SCHEMA = `
    CREATE TABLE IF NOT EXISTS embedding_metadata (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        model_name TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        created_at TEXT NOT NULL
    );
`;

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

    // Create metadata table and regular tables (vec_index is created separately)
    db.exec(METADATA_SCHEMA);
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

export function resetDatabase(dimensions: number = 768): void {
    if (db) {
        db.exec('DROP TABLE IF EXISTS index_entries');
        db.exec('DROP TABLE IF EXISTS directories');
        db.exec('DROP TABLE IF EXISTS vec_index');
        db.exec('DROP TABLE IF EXISTS embedding_metadata');
        db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS vec_index USING vec0(
                embedding float[${dimensions}]
            );
        `);
        db.exec(METADATA_SCHEMA);
        db.exec(SCHEMA);
        logger.info('Database reset');
    }
}

// Create vec_index table with specific dimensions
export function createVecIndex(dimensions: number): void {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }

    db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_index USING vec0(
            embedding float[${dimensions}]
        );
    `);
    logger.debug(`Created vec_index with ${dimensions} dimensions`);
}

// Get embedding metadata from database
export function getEmbeddingMetadata(): EmbeddingMetadata | null {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }

    const row = db.prepare(
        'SELECT model_name, dimensions, created_at FROM embedding_metadata WHERE id = 1'
    ).get() as { model_name: string; dimensions: number; created_at: string } | undefined;

    if (!row) {
        return null;
    }

    return {
        modelName: row.model_name,
        dimensions: row.dimensions,
        createdAt: new Date(row.created_at)
    };
}

// Set embedding metadata
export function setEmbeddingMetadata(metadata: EmbeddingMetadata): void {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }

    db.prepare(`
        INSERT OR REPLACE INTO embedding_metadata (id, model_name, dimensions, created_at)
        VALUES (1, ?, ?, ?)
    `).run(metadata.modelName, metadata.dimensions, metadata.createdAt.toISOString());

    logger.debug(`Set embedding metadata: model=${metadata.modelName}, dimensions=${metadata.dimensions}`);
}

// Reset database for model change (preserves directories table)
export function resetForModelChange(newDimensions: number): void {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }

    logger.info(`Resetting database for model change (new dimensions: ${newDimensions})`);

    // Drop tables that contain embeddings
    db.exec('DROP TABLE IF EXISTS index_entries');
    db.exec('DROP TABLE IF EXISTS vec_index');

    // Recreate vec_index with new dimensions
    db.exec(`
        CREATE VIRTUAL TABLE vec_index USING vec0(
            embedding float[${newDimensions}]
        );
    `);

    // Recreate index_entries table
    db.exec(`
        CREATE TABLE IF NOT EXISTS index_entries (
            id TEXT PRIMARY KEY,
            path TEXT UNIQUE NOT NULL,
            content TEXT NOT NULL,
            indexed_at TEXT NOT NULL,
            file_modified_at TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            rowid_vec INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_entries_path ON index_entries(path);
    `);

    // Reset file counts in directories (but keep the directories registered)
    db.exec('UPDATE directories SET file_count = 0, last_indexed_at = NULL');

    logger.info('Database reset for model change complete');
}
