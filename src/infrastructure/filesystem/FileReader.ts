import * as fs from 'fs/promises';
import * as path from 'path';
import micromatch from 'micromatch';
import type { SimiloConfig } from '../../domain/model/Config.js';
import logger from '../logger/index.js';

export interface FileContent {
    content: string;
    path: string;
    modifiedAt: Date;
    size: number;
}

export interface FileReaderOptions {
    extensions: string[];
    ignorePatterns: string[];
    maxFileSize: number;
}

export class FileReader {
    private options: FileReaderOptions;

    constructor(config: SimiloConfig) {
        this.options = {
            extensions: config.indexing.extensions,
            ignorePatterns: config.indexing.ignorePatterns,
            maxFileSize: config.indexing.maxFileSize
        };
    }

    async read(filePath: string): Promise<FileContent | null> {
        try {
            const stats = await fs.stat(filePath);

            if (!stats.isFile()) {
                return null;
            }

            // Check file size
            if (stats.size > this.options.maxFileSize) {
                logger.warn(`File too large, skipping: ${filePath} (${stats.size} bytes > ${this.options.maxFileSize})`);
                return null;
            }

            // Check if supported
            if (!this.isSupported(filePath)) {
                return null;
            }

            const content = await fs.readFile(filePath, 'utf-8');

            return {
                content,
                path: filePath,
                modifiedAt: stats.mtime,
                size: stats.size
            };
        } catch (error) {
            logger.error(`Failed to read file: ${filePath}`, error);
            return null;
        }
    }

    isSupported(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();

        // Check extension
        if (!this.options.extensions.includes(ext)) {
            return false;
        }

        // Check ignore patterns
        if (this.shouldIgnore(filePath)) {
            return false;
        }

        return true;
    }

    shouldIgnore(filePath: string): boolean {
        return micromatch.isMatch(filePath, this.options.ignorePatterns, {
            dot: true,
            contains: true
        });
    }

    async getModifiedTime(filePath: string): Promise<Date | null> {
        try {
            const stats = await fs.stat(filePath);
            return stats.mtime;
        } catch {
            return null;
        }
    }

    async scanDirectory(dirPath: string): Promise<string[]> {
        const files: string[] = [];

        const scan = async (currentPath: string): Promise<void> => {
            try {
                const entries = await fs.readdir(currentPath, { withFileTypes: true });

                for (const entry of entries) {
                    const fullPath = path.join(currentPath, entry.name);

                    if (this.shouldIgnore(fullPath)) {
                        continue;
                    }

                    if (entry.isDirectory()) {
                        await scan(fullPath);
                    } else if (entry.isFile() && this.isSupported(fullPath)) {
                        files.push(fullPath);
                    }
                }
            } catch (error) {
                logger.error(`Failed to scan directory: ${currentPath}`, error);
            }
        };

        await scan(dirPath);
        return files;
    }
}
