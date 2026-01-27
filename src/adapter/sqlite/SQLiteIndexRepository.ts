import type { IndexEntry } from '../../domain/model/IndexEntry.js';
import type { IndexRepository } from '../../domain/repository/IndexRepository.js';
import { getDatabase } from '../../infrastructure/database/DatabaseManager.js';
import logger from '../../infrastructure/logger/index.js';

export class SQLiteIndexRepository implements IndexRepository {
    async insert(entry: IndexEntry): Promise<void> {
        const db = getDatabase();

        // Insert embedding into vec_index
        const vecInsert = db.prepare(`
            INSERT INTO vec_index(embedding) VALUES (?)
        `);

        const vecBuffer = Buffer.from(new Float32Array(entry.embedding).buffer);
        const result = vecInsert.run(vecBuffer);
        const rowidVec = result.lastInsertRowid;

        // Insert metadata into index_entries
        const entryInsert = db.prepare(`
            INSERT INTO index_entries (id, path, content, indexed_at, file_modified_at, file_size, rowid_vec)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        entryInsert.run(
            entry.id,
            entry.path,
            entry.content,
            entry.indexedAt.toISOString(),
            entry.fileModifiedAt.toISOString(),
            entry.fileSize,
            rowidVec
        );

        logger.debug(`Indexed: ${entry.path}`);
    }

    async update(entry: IndexEntry): Promise<void> {
        const db = getDatabase();

        // Get existing rowid_vec
        const existing = db.prepare(`
            SELECT rowid_vec FROM index_entries WHERE path = ?
        `).get(entry.path) as { rowid_vec: number } | undefined;

        if (!existing) {
            // If not exists, insert instead
            return this.insert(entry);
        }

        // Update embedding in vec_index
        const vecBuffer = Buffer.from(new Float32Array(entry.embedding).buffer);
        db.prepare(`
            UPDATE vec_index SET embedding = ? WHERE rowid = ?
        `).run(vecBuffer, existing.rowid_vec);

        // Update metadata
        db.prepare(`
            UPDATE index_entries
            SET content = ?, indexed_at = ?, file_modified_at = ?, file_size = ?
            WHERE path = ?
        `).run(
            entry.content,
            entry.indexedAt.toISOString(),
            entry.fileModifiedAt.toISOString(),
            entry.fileSize,
            entry.path
        );

        logger.debug(`Updated: ${entry.path}`);
    }

    async delete(path: string): Promise<void> {
        const db = getDatabase();

        // Get rowid_vec first
        const existing = db.prepare(`
            SELECT rowid_vec FROM index_entries WHERE path = ?
        `).get(path) as { rowid_vec: number } | undefined;

        if (existing) {
            // Delete from vec_index
            db.prepare('DELETE FROM vec_index WHERE rowid = ?').run(existing.rowid_vec);
        }

        // Delete from index_entries
        db.prepare('DELETE FROM index_entries WHERE path = ?').run(path);

        logger.debug(`Deleted: ${path}`);
    }

    async deleteByDirectory(dirPath: string): Promise<number> {
        const db = getDatabase();

        // Ensure dirPath ends with separator for proper prefix matching
        const prefix = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;

        // Get all rowid_vec values for entries in directory
        const entries = db.prepare(`
            SELECT rowid_vec FROM index_entries WHERE path LIKE ? OR path = ?
        `).all(`${prefix}%`, dirPath) as { rowid_vec: number }[];

        // Delete from vec_index
        for (const entry of entries) {
            db.prepare('DELETE FROM vec_index WHERE rowid = ?').run(entry.rowid_vec);
        }

        // Delete from index_entries
        const result = db.prepare(`
            DELETE FROM index_entries WHERE path LIKE ? OR path = ?
        `).run(`${prefix}%`, dirPath);

        logger.debug(`Deleted ${result.changes} entries from directory: ${dirPath}`);
        return result.changes;
    }

    async findByPath(path: string): Promise<IndexEntry | null> {
        const db = getDatabase();

        const row = db.prepare(`
            SELECT ie.*, vi.embedding
            FROM index_entries ie
            JOIN vec_index vi ON ie.rowid_vec = vi.rowid
            WHERE ie.path = ?
        `).get(path) as RawIndexEntry | undefined;

        if (!row) {
            return null;
        }

        return this.mapRowToEntry(row);
    }

    async findSimilar(
        embedding: number[],
        limit: number,
        pathFilter?: string
    ): Promise<Array<{ entry: IndexEntry; score: number }>> {
        const db = getDatabase();

        const vecBuffer = Buffer.from(new Float32Array(embedding).buffer);

        let query: string;
        let params: unknown[];

        if (pathFilter) {
            const prefix = pathFilter.endsWith('/') ? pathFilter : `${pathFilter}/`;
            query = `
                SELECT ie.*, vi.embedding, vi.distance
                FROM vec_index vi
                JOIN index_entries ie ON ie.rowid_vec = vi.rowid
                WHERE vi.embedding MATCH ?
                AND k = ?
                AND (ie.path LIKE ? OR ie.path = ?)
                ORDER BY vi.distance
            `;
            params = [vecBuffer, limit * 2, `${prefix}%`, pathFilter];
        } else {
            query = `
                SELECT ie.*, vi.embedding, vi.distance
                FROM vec_index vi
                JOIN index_entries ie ON ie.rowid_vec = vi.rowid
                WHERE vi.embedding MATCH ?
                AND k = ?
                ORDER BY vi.distance
            `;
            params = [vecBuffer, limit];
        }

        const rows = db.prepare(query).all(...params) as RawSearchResult[];

        const results = rows.map(row => ({
            entry: this.mapRowToEntry(row),
            // Convert L2 distance to similarity score (0-1 range)
            // Lower distance = higher similarity
            score: 1 / (1 + row.distance)
        }));

        // If path filter was used, we requested more results, so trim to limit
        return results.slice(0, limit);
    }

    async findAll(): Promise<IndexEntry[]> {
        const db = getDatabase();

        const rows = db.prepare(`
            SELECT ie.*, vi.embedding
            FROM index_entries ie
            JOIN vec_index vi ON ie.rowid_vec = vi.rowid
        `).all() as RawIndexEntry[];

        return rows.map(row => this.mapRowToEntry(row));
    }

    async count(): Promise<number> {
        const db = getDatabase();
        const result = db.prepare('SELECT COUNT(*) as count FROM index_entries').get() as { count: number };
        return result.count;
    }

    async countByDirectory(dirPath: string): Promise<number> {
        const db = getDatabase();
        const prefix = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
        const result = db.prepare(`
            SELECT COUNT(*) as count FROM index_entries WHERE path LIKE ? OR path = ?
        `).get(`${prefix}%`, dirPath) as { count: number };
        return result.count;
    }

    private mapRowToEntry(row: RawIndexEntry): IndexEntry {
        // embedding is stored as a Buffer, convert back to number[]
        const embeddingBuffer = row.embedding as Buffer;
        const float32Array = new Float32Array(
            embeddingBuffer.buffer,
            embeddingBuffer.byteOffset,
            embeddingBuffer.byteLength / 4
        );

        return {
            id: row.id,
            path: row.path,
            content: row.content,
            embedding: Array.from(float32Array),
            indexedAt: new Date(row.indexed_at),
            fileModifiedAt: new Date(row.file_modified_at),
            fileSize: row.file_size
        };
    }
}

interface RawIndexEntry {
    id: string;
    path: string;
    content: string;
    indexed_at: string;
    file_modified_at: string;
    file_size: number;
    rowid_vec: number;
    embedding: Buffer;
}

interface RawSearchResult extends RawIndexEntry {
    distance: number;
}
