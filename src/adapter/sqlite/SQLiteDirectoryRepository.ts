import type { Directory } from '../../domain/model/Directory.js';
import type { DirectoryRepository } from '../../domain/repository/DirectoryRepository.js';
import { getDatabase } from '../../infrastructure/database/DatabaseManager.js';
import logger from '../../infrastructure/logger/index.js';

export class SQLiteDirectoryRepository implements DirectoryRepository {
    async insert(directory: Directory): Promise<void> {
        const db = getDatabase();

        db.prepare(`
            INSERT INTO directories (id, path, added_at, file_count, last_indexed_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            directory.id,
            directory.path,
            directory.addedAt.toISOString(),
            directory.fileCount,
            directory.lastIndexedAt?.toISOString() ?? null
        );

        logger.debug(`Directory added: ${directory.path}`);
    }

    async delete(path: string): Promise<void> {
        const db = getDatabase();
        db.prepare('DELETE FROM directories WHERE path = ?').run(path);
        logger.debug(`Directory removed: ${path}`);
    }

    async findByPath(path: string): Promise<Directory | null> {
        const db = getDatabase();

        const row = db.prepare(`
            SELECT * FROM directories WHERE path = ?
        `).get(path) as RawDirectory | undefined;

        if (!row) {
            return null;
        }

        return this.mapRowToDirectory(row);
    }

    async findAll(): Promise<Directory[]> {
        const db = getDatabase();

        const rows = db.prepare('SELECT * FROM directories ORDER BY added_at DESC').all() as RawDirectory[];

        return rows.map(row => this.mapRowToDirectory(row));
    }

    async updateFileCount(path: string, count: number): Promise<void> {
        const db = getDatabase();
        db.prepare('UPDATE directories SET file_count = ? WHERE path = ?').run(count, path);
    }

    async updateLastIndexedAt(path: string, date: Date): Promise<void> {
        const db = getDatabase();
        db.prepare('UPDATE directories SET last_indexed_at = ? WHERE path = ?').run(
            date.toISOString(),
            path
        );
    }

    private mapRowToDirectory(row: RawDirectory): Directory {
        return {
            id: row.id,
            path: row.path,
            addedAt: new Date(row.added_at),
            fileCount: row.file_count,
            lastIndexedAt: row.last_indexed_at ? new Date(row.last_indexed_at) : null
        };
    }
}

interface RawDirectory {
    id: string;
    path: string;
    added_at: string;
    file_count: number;
    last_indexed_at: string | null;
}
