import chokidar, { type FSWatcher } from 'chokidar';
import type { SimiloConfig } from '../../domain/model/Config.js';
import logger from '../logger/index.js';

export type FileEventType = 'add' | 'change' | 'unlink';
export type FileEventHandler = (path: string, eventType: FileEventType) => void;

export class FileWatcher {
    private watcher: FSWatcher | null = null;
    private directories: Set<string> = new Set();
    private handlers: FileEventHandler[] = [];
    private config: SimiloConfig;

    constructor(config: SimiloConfig) {
        this.config = config;
    }

    addDirectory(dirPath: string): void {
        this.directories.add(dirPath);

        if (this.watcher) {
            this.watcher.add(dirPath);
            logger.debug(`Added directory to watcher: ${dirPath}`);
        }
    }

    removeDirectory(dirPath: string): void {
        this.directories.delete(dirPath);

        if (this.watcher) {
            this.watcher.unwatch(dirPath);
            logger.debug(`Removed directory from watcher: ${dirPath}`);
        }
    }

    onFileChange(handler: FileEventHandler): void {
        this.handlers.push(handler);
    }

    start(): void {
        if (this.watcher) {
            logger.warn('Watcher already running');
            return;
        }

        this.watcher = chokidar.watch(Array.from(this.directories), {
            ignored: this.config.indexing.ignorePatterns.map(p => `**/${p}/**`),
            persistent: true,
            ignoreInitial: true, // Don't process existing files on start
            awaitWriteFinish: {
                stabilityThreshold: 500,
                pollInterval: 100
            },
            depth: 99,
            followSymlinks: false
        });

        this.watcher.on('add', (path) => {
            if (this.isSupportedFile(path)) {
                this.emitEvent(path, 'add');
            }
        });

        this.watcher.on('change', (path) => {
            if (this.isSupportedFile(path)) {
                this.emitEvent(path, 'change');
            }
        });

        this.watcher.on('unlink', (path) => {
            if (this.isSupportedFile(path)) {
                this.emitEvent(path, 'unlink');
            }
        });

        this.watcher.on('error', (error) => {
            logger.error('File watcher error', error);
        });

        this.watcher.on('ready', () => {
            logger.info(`File watcher ready. Watching ${this.directories.size} directories`);
        });

        logger.debug('File watcher started');
    }

    stop(): void {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
            logger.debug('File watcher stopped');
        }
    }

    isRunning(): boolean {
        return this.watcher !== null;
    }

    getWatchedDirectories(): string[] {
        return Array.from(this.directories);
    }

    private isSupportedFile(filePath: string): boolean {
        const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
        return this.config.indexing.extensions.includes(ext);
    }

    private emitEvent(path: string, eventType: FileEventType): void {
        logger.debug(`File ${eventType}: ${path}`);
        for (const handler of this.handlers) {
            try {
                handler(path, eventType);
            } catch (error) {
                logger.error(`Error in file event handler: ${error}`);
            }
        }
    }
}
