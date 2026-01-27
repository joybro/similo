import type { Directory } from '../model/Directory.js';

export interface DirectoryRepository {
    insert(directory: Directory): Promise<void>;
    delete(path: string): Promise<void>;
    findByPath(path: string): Promise<Directory | null>;
    findAll(): Promise<Directory[]>;
    updateFileCount(path: string, count: number): Promise<void>;
    updateLastIndexedAt(path: string, date: Date): Promise<void>;
}
