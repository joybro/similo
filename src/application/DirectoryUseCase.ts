import * as fs from 'fs/promises';
import * as path from 'path';
import { createDirectory, type Directory } from '../domain/model/Directory.js';
import type { DirectoryRepository } from '../domain/repository/DirectoryRepository.js';
import type { IndexRepository } from '../domain/repository/IndexRepository.js';
import type { FileChangeQueue } from '../services/FileChangeQueue.js';
import logger from '../infrastructure/logger/index.js';

export interface AddDirectoryResult {
    directory: Directory;
    queuedCount: number;
}

export class DirectoryUseCase {
    constructor(
        private directoryRepo: DirectoryRepository,
        private indexRepo: IndexRepository,
        private fileChangeQueue: FileChangeQueue
    ) {}

    async add(dirPath: string): Promise<AddDirectoryResult> {
        // Resolve to absolute path
        const absolutePath = path.resolve(dirPath);

        // Validate path exists and is a directory
        try {
            const stats = await fs.stat(absolutePath);
            if (!stats.isDirectory()) {
                throw new InvalidPathError(`Not a directory: ${absolutePath}`);
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                throw new InvalidPathError(`Directory not found: ${absolutePath}`);
            }
            throw error;
        }

        // Check if already registered
        const existing = await this.directoryRepo.findByPath(absolutePath);
        if (existing) {
            logger.info(`Directory already registered, re-queuing: ${absolutePath}`);
            // Queue files for re-indexing
            const queuedCount = await this.fileChangeQueue.enqueueDirectory(absolutePath);
            return { directory: existing, queuedCount };
        }

        // Create new directory entry
        const directory = createDirectory({ path: absolutePath });
        await this.directoryRepo.insert(directory);

        logger.info(`Directory added: ${absolutePath}`);

        // Queue all files from the directory for indexing (async)
        const queuedCount = await this.fileChangeQueue.enqueueDirectory(absolutePath);

        return {
            directory,
            queuedCount
        };
    }

    async remove(dirPath: string): Promise<void> {
        const absolutePath = path.resolve(dirPath);

        // Check if registered
        const existing = await this.directoryRepo.findByPath(absolutePath);
        if (!existing) {
            throw new DirectoryNotFoundError(`Directory not registered: ${absolutePath}`);
        }

        // Remove all indexed files from this directory
        const deletedCount = await this.indexRepo.deleteByDirectory(absolutePath);
        logger.info(`Removed ${deletedCount} indexed files from: ${absolutePath}`);

        // Remove directory from registry
        await this.directoryRepo.delete(absolutePath);

        logger.info(`Directory removed: ${absolutePath}`);
    }

    async list(): Promise<Directory[]> {
        const directories = await this.directoryRepo.findAll();

        // Get real-time file counts from index_entries table
        const directoriesWithRealCounts = await Promise.all(
            directories.map(async (dir) => {
                const realFileCount = await this.indexRepo.countByDirectory(dir.path);
                return {
                    ...dir,
                    fileCount: realFileCount
                };
            })
        );

        return directoriesWithRealCounts;
    }

    async get(dirPath: string): Promise<Directory | null> {
        const absolutePath = path.resolve(dirPath);
        return this.directoryRepo.findByPath(absolutePath);
    }
}

export class InvalidPathError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidPathError';
    }
}

export class DirectoryNotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DirectoryNotFoundError';
    }
}
