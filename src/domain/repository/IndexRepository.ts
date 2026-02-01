import type { IndexEntry } from '../model/IndexEntry.js';

export interface IndexRepository {
    insert(entry: IndexEntry): Promise<void>;
    update(entry: IndexEntry): Promise<void>;
    delete(path: string): Promise<void>;
    deleteByDirectory(dirPath: string): Promise<number>;
    findByPath(path: string): Promise<IndexEntry | null>;
    findSimilar(embedding: number[], limit: number, pathFilter?: string): Promise<Array<{ entry: IndexEntry; score: number }>>;
    findAll(): Promise<IndexEntry[]>;
    count(): Promise<number>;
    countByDirectory(dirPath: string): Promise<number>;
    getLatestIndexedAtByDirectory(dirPath: string): Promise<Date | null>;
}
