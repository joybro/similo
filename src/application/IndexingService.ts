import { createIndexEntry } from '../domain/model/IndexEntry.js';
import type { IndexRepository } from '../domain/repository/IndexRepository.js';
import type { DirectoryRepository } from '../domain/repository/DirectoryRepository.js';
import type { EmbeddingProvider } from '../domain/service/EmbeddingProvider.js';
import type { FileReader } from '../infrastructure/filesystem/FileReader.js';
import { ContextLengthExceededError } from '../adapter/ollama/OllamaEmbeddingProvider.js';
import logger from '../infrastructure/logger/index.js';

export interface IndexingResult {
    indexed: number;
    skipped: number;
    errors: number;
}

export class IndexingService {
    constructor(
        private indexRepo: IndexRepository,
        private directoryRepo: DirectoryRepository,
        private embeddingProvider: EmbeddingProvider,
        private fileReader: FileReader
    ) {}

    async indexFile(filePath: string): Promise<boolean> {
        try {
            const fileContent = await this.fileReader.read(filePath);

            if (!fileContent) {
                logger.debug(`Skipped file (not readable or not supported): ${filePath}`);
                return false;
            }

            // Check if file already indexed and up to date
            const existing = await this.indexRepo.findByPath(filePath);
            if (existing) {
                if (existing.fileModifiedAt >= fileContent.modifiedAt) {
                    logger.debug(`File already up to date: ${filePath}`);
                    return false;
                }
            }

            // Generate embedding
            const embedding = await this.embeddingProvider.embed(fileContent.content);

            // Create or update index entry
            const entry = createIndexEntry({
                path: filePath,
                content: fileContent.content,
                embedding,
                fileModifiedAt: fileContent.modifiedAt,
                fileSize: fileContent.size
            });

            if (existing) {
                entry.id = existing.id;
                await this.indexRepo.update(entry);
            } else {
                await this.indexRepo.insert(entry);
            }

            logger.info(`Indexed: ${filePath}`);
            return true;
        } catch (error) {
            // Handle context length exceeded as a skip, not an error
            if (error instanceof ContextLengthExceededError) {
                logger.warn(`File too long for embedding model, skipping: ${filePath}`);
                return false;
            }
            logger.error(`Failed to index file: ${filePath}`, error);
            throw error;
        }
    }

    async indexDirectory(dirPath: string): Promise<IndexingResult> {
        const result: IndexingResult = {
            indexed: 0,
            skipped: 0,
            errors: 0
        };

        logger.info(`Starting indexing: ${dirPath}`);

        const files = await this.fileReader.scanDirectory(dirPath);
        logger.info(`Found ${files.length} files to index`);

        for (const file of files) {
            try {
                const indexed = await this.indexFile(file);
                if (indexed) {
                    result.indexed++;
                } else {
                    result.skipped++;
                }
            } catch {
                result.errors++;
            }
        }

        // Update directory stats
        const fileCount = await this.indexRepo.countByDirectory(dirPath);
        await this.directoryRepo.updateFileCount(dirPath, fileCount);
        await this.directoryRepo.updateLastIndexedAt(dirPath, new Date());

        logger.info(`Indexing complete: ${result.indexed} indexed, ${result.skipped} skipped, ${result.errors} errors`);

        return result;
    }

    async removeFile(filePath: string): Promise<void> {
        await this.indexRepo.delete(filePath);
        logger.info(`Removed from index: ${filePath}`);
    }

    async reindexStaleFiles(): Promise<IndexingResult> {
        const result: IndexingResult = {
            indexed: 0,
            skipped: 0,
            errors: 0
        };

        const directories = await this.directoryRepo.findAll();

        for (const dir of directories) {
            const dirResult = await this.indexDirectory(dir.path);
            result.indexed += dirResult.indexed;
            result.skipped += dirResult.skipped;
            result.errors += dirResult.errors;
        }

        return result;
    }
}
