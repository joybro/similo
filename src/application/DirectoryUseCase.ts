import * as fs from 'fs/promises';
import * as path from 'path';
import { createDirectory, type Directory } from '../domain/model/Directory.js';
import type { DirectoryRepository } from '../domain/repository/DirectoryRepository.js';
import type { IndexRepository } from '../domain/repository/IndexRepository.js';
import type { IndexingService, IndexingResult } from './IndexingService.js';
import logger from '../infrastructure/logger/index.js';

export interface AddDirectoryResult {
    directory: Directory;
    indexingResult: IndexingResult;
}

export class DirectoryUseCase {
    constructor(
        private directoryRepo: DirectoryRepository,
        private indexRepo: IndexRepository,
        private indexingService: IndexingService
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
            logger.info(`Directory already registered, re-indexing: ${absolutePath}`);
            // Re-index existing directory
            const indexingResult = await this.indexingService.indexDirectory(absolutePath);
            return { directory: existing, indexingResult };
        }

        // Create new directory entry
        const directory = createDirectory({ path: absolutePath });
        await this.directoryRepo.insert(directory);

        logger.info(`Directory added: ${absolutePath}`);

        // Index the directory
        const indexingResult = await this.indexingService.indexDirectory(absolutePath);

        // Update directory with file count
        const updatedDir = await this.directoryRepo.findByPath(absolutePath);

        return {
            directory: updatedDir || directory,
            indexingResult
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
        return this.directoryRepo.findAll();
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
