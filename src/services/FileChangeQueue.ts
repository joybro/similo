import type { IndexRepository } from '../domain/repository/IndexRepository.js';
import type { FileReader } from '../infrastructure/filesystem/FileReader.js';
import logger from '../infrastructure/logger/index.js';

export type FileChangeReason = 'new' | 'modified' | 'deleted';

export interface FileChange {
    path: string;
    reason: FileChangeReason;
    mtime?: number;
}

interface FileInfo {
    path: string;
    mtime: number;
}

interface SyncAnalysis {
    toAdd: FileInfo[];
    toRemove: string[];
    toUpdate: FileInfo[];
}

/**
 * Queue for managing file changes to be indexed.
 * Handles both startup synchronization and runtime file watch events.
 */
export class FileChangeQueue {
    private queue: FileChange[] = [];

    constructor(
        private indexRepo: IndexRepository,
        private fileReader: FileReader
    ) {}

    /**
     * Initialize the queue by analyzing what files need to be synchronized.
     * Compares current filesystem state with indexed state.
     */
    async initialize(directoryPaths: string[]): Promise<void> {
        const analysis = await this.analyzeSyncNeeds(directoryPaths);

        this.queue = this.createChangesFromAnalysis(analysis);

        logger.info(`FileChangeQueue initialized: ${analysis.toAdd.length} to add, ` +
            `${analysis.toUpdate.length} to update, ${analysis.toRemove.length} to remove`);
    }

    /**
     * Enqueue files from a newly added directory.
     * All files are marked as 'new' since the directory wasn't being watched before.
     */
    async enqueueDirectory(dirPath: string): Promise<number> {
        const files = await this.fileReader.scanDirectory(dirPath);
        let count = 0;

        for (const filePath of files) {
            const fileContent = await this.fileReader.read(filePath);
            if (fileContent) {
                // Remove if already in queue (avoid duplicates)
                this.queue = this.queue.filter(c => c.path !== filePath);

                this.queue.push({
                    path: filePath,
                    reason: 'new',
                    mtime: fileContent.modifiedAt.getTime()
                });
                count++;
            }
        }

        logger.info(`Enqueued ${count} files from directory: ${dirPath}`);
        return count;
    }

    /**
     * Add a file change to the queue (called by FileWatcher).
     * Handles deduplication - if the same file is already queued, it's replaced.
     */
    enqueue(change: FileChange): void {
        // Remove existing entry for this path (if any)
        this.queue = this.queue.filter(c => c.path !== change.path);

        this.queue.push(change);
        logger.debug(`Enqueued: ${change.path} (${change.reason})`);
    }

    /**
     * Poll up to maxCount items from the queue.
     * Items are removed from the queue when polled.
     */
    poll(maxCount: number): FileChange[] {
        const changes = this.queue.slice(0, maxCount);
        this.queue = this.queue.slice(maxCount);
        return changes;
    }

    /**
     * Get the number of pending changes in the queue.
     */
    getCount(): number {
        return this.queue.length;
    }

    /**
     * Clear all items from the queue.
     */
    clear(): void {
        this.queue = [];
    }

    /**
     * Analyze what files need to be synchronized between filesystem and index.
     */
    private async analyzeSyncNeeds(directoryPaths: string[]): Promise<SyncAnalysis> {
        const toAdd: FileInfo[] = [];
        const toRemove: string[] = [];
        const toUpdate: FileInfo[] = [];

        // Get all files from registered directories
        const currentFiles = new Map<string, number>();
        for (const dirPath of directoryPaths) {
            const files = await this.fileReader.scanDirectory(dirPath);
            for (const filePath of files) {
                const fileContent = await this.fileReader.read(filePath);
                if (fileContent) {
                    currentFiles.set(filePath, fileContent.modifiedAt.getTime());
                }
            }
        }

        // Get all indexed files
        const indexedEntries = await this.indexRepo.findAll();
        const indexedPaths = new Set<string>();

        for (const entry of indexedEntries) {
            indexedPaths.add(entry.path);

            const currentMtime = currentFiles.get(entry.path);
            if (currentMtime === undefined) {
                // File was indexed but no longer exists or is outside watched directories
                toRemove.push(entry.path);
            } else if (currentMtime > entry.fileModifiedAt.getTime()) {
                // File exists and has been modified
                toUpdate.push({ path: entry.path, mtime: currentMtime });
            }
        }

        // Find new files (in filesystem but not indexed)
        for (const [filePath, mtime] of currentFiles) {
            if (!indexedPaths.has(filePath)) {
                toAdd.push({ path: filePath, mtime });
            }
        }

        return { toAdd, toRemove, toUpdate };
    }

    /**
     * Create FileChange objects from sync analysis.
     */
    private createChangesFromAnalysis(analysis: SyncAnalysis): FileChange[] {
        const changes: FileChange[] = [];

        for (const fileInfo of analysis.toAdd) {
            changes.push({
                path: fileInfo.path,
                reason: 'new',
                mtime: fileInfo.mtime
            });
        }

        for (const fileInfo of analysis.toUpdate) {
            changes.push({
                path: fileInfo.path,
                reason: 'modified',
                mtime: fileInfo.mtime
            });
        }

        for (const filePath of analysis.toRemove) {
            changes.push({
                path: filePath,
                reason: 'deleted'
            });
        }

        return changes;
    }
}
