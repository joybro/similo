import * as http from 'http';
import { URL } from 'url';
import { loadConfig, ensureSimiloDir } from '../domain/model/Config.js';
import { initDatabase, closeDatabase } from '../infrastructure/database/DatabaseManager.js';
import { SQLiteIndexRepository } from '../adapter/sqlite/SQLiteIndexRepository.js';
import { SQLiteDirectoryRepository } from '../adapter/sqlite/SQLiteDirectoryRepository.js';
import { OllamaEmbeddingProvider } from '../adapter/ollama/OllamaEmbeddingProvider.js';
import { FileReader } from '../infrastructure/filesystem/FileReader.js';
import { FileWatcher } from '../infrastructure/filesystem/FileWatcher.js';
import { ProcessManager } from '../infrastructure/process/ProcessManager.js';
import { IndexingService } from '../application/IndexingService.js';
import { SearchUseCase } from '../application/SearchUseCase.js';
import { DirectoryUseCase } from '../application/DirectoryUseCase.js';
import { FileChangeQueue } from '../services/FileChangeQueue.js';
import logger from '../infrastructure/logger/index.js';

interface ServerContext {
    config: ReturnType<typeof loadConfig>;
    indexRepo: SQLiteIndexRepository;
    directoryRepo: SQLiteDirectoryRepository;
    embeddingProvider: OllamaEmbeddingProvider;
    fileReader: FileReader;
    indexingService: IndexingService;
    searchUseCase: SearchUseCase;
    directoryUseCase: DirectoryUseCase;
    fileWatcher: FileWatcher;
    fileChangeQueue: FileChangeQueue;
    processManager: ProcessManager;
}

let context: ServerContext | null = null;
let server: http.Server | null = null;
let isShuttingDown = false;
let indexingLoopTimer: NodeJS.Timeout | null = null;

async function initContext(): Promise<ServerContext> {
    ensureSimiloDir();
    const config = loadConfig();

    initDatabase();

    const indexRepo = new SQLiteIndexRepository();
    const directoryRepo = new SQLiteDirectoryRepository();
    const embeddingProvider = new OllamaEmbeddingProvider(
        config.ollama.host,
        config.ollama.model
    );
    const fileReader = new FileReader(config);
    const indexingService = new IndexingService(
        indexRepo,
        directoryRepo,
        embeddingProvider,
        fileReader
    );
    const searchUseCase = new SearchUseCase(indexRepo, embeddingProvider);
    const fileChangeQueue = new FileChangeQueue(indexRepo, fileReader);
    const directoryUseCase = new DirectoryUseCase(
        directoryRepo,
        indexRepo,
        fileChangeQueue
    );
    const fileWatcher = new FileWatcher(config);
    const processManager = new ProcessManager();

    // Set up file watcher to enqueue changes (not process directly)
    fileWatcher.onFileChange((path, eventType) => {
        if (eventType === 'unlink') {
            fileChangeQueue.enqueue({ path, reason: 'deleted' });
        } else {
            // For add/change, we need to get mtime
            fileReader.read(path).then(content => {
                if (content) {
                    fileChangeQueue.enqueue({
                        path,
                        reason: eventType === 'add' ? 'new' : 'modified',
                        mtime: content.modifiedAt.getTime()
                    });
                }
            }).catch(error => {
                logger.error(`Error reading file for queue: ${path}`, error);
            });
        }
    });

    // Load existing directories into watcher
    const directories = await directoryRepo.findAll();
    for (const dir of directories) {
        fileWatcher.addDirectory(dir.path);
    }

    return {
        config,
        indexRepo,
        directoryRepo,
        embeddingProvider,
        fileReader,
        indexingService,
        searchUseCase,
        directoryUseCase,
        fileWatcher,
        fileChangeQueue,
        processManager
    };
}

/**
 * Background indexing loop - processes one file at a time from the queue.
 */
function startIndexingLoop(ctx: ServerContext): void {
    const processNext = async () => {
        if (isShuttingDown) return;

        const changes = ctx.fileChangeQueue.poll(1);

        if (changes.length === 0) {
            // Queue is empty, wait before checking again
            indexingLoopTimer = setTimeout(processNext, 1000);
            return;
        }

        const change = changes[0]!;
        logger.info(`Processing: ${change.path} (${change.reason})`);

        try {
            if (change.reason === 'deleted') {
                await ctx.indexingService.removeFile(change.path);
            } else {
                await ctx.indexingService.indexFile(change.path);
            }
        } catch (error) {
            logger.error(`Error processing ${change.path}:`, error);
        }

        // Process next immediately (no delay between items)
        setImmediate(processNext);
    };

    processNext();
}

function stopIndexingLoop(): void {
    if (indexingLoopTimer) {
        clearTimeout(indexingLoopTimer);
        indexingLoopTimer = null;
    }
}

async function handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    ctx: ServerContext
): Promise<void> {
    const url = new URL(req.url || '/', `http://localhost:${ctx.config.server.port}`);

    // CORS headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.writeHead(204);
        res.end();
        return;
    }

    try {
        // GET /status
        if (req.method === 'GET' && url.pathname === '/status') {
            const directories = await ctx.directoryRepo.findAll();
            const totalFiles = await ctx.indexRepo.count();
            const queuedFiles = ctx.fileChangeQueue.getCount();

            sendJson(res, 200, {
                status: 'running',
                port: ctx.config.server.port,
                directories: directories.length,
                indexedFiles: totalFiles,
                queuedFiles,
                ollamaModel: ctx.config.ollama.model
            });
            return;
        }

        // GET /search
        if (req.method === 'GET' && url.pathname === '/search') {
            const query = url.searchParams.get('q');
            if (!query) {
                sendJson(res, 400, { error: 'Missing query parameter: q' });
                return;
            }

            const limit = parseInt(url.searchParams.get('limit') || '10', 10);
            const path = url.searchParams.get('path') || undefined;

            const startTime = Date.now();
            const results = await ctx.searchUseCase.search(query, { limit, path });
            const tookMs = Date.now() - startTime;

            sendJson(res, 200, {
                results,
                query,
                took_ms: tookMs
            });
            return;
        }

        // GET /directories
        if (req.method === 'GET' && url.pathname === '/directories') {
            const directories = await ctx.directoryUseCase.list();
            sendJson(res, 200, { directories });
            return;
        }

        // POST /directories
        if (req.method === 'POST' && url.pathname === '/directories') {
            const body = await readBody(req);
            const { path: dirPath } = JSON.parse(body);

            if (!dirPath) {
                sendJson(res, 400, { error: 'Missing path in request body' });
                return;
            }

            const result = await ctx.directoryUseCase.add(dirPath);

            // Add to file watcher
            ctx.fileWatcher.addDirectory(result.directory.path);

            sendJson(res, 201, {
                directory: result.directory,
                queuedCount: result.queuedCount
            });
            return;
        }

        // DELETE /directories/:path
        if (req.method === 'DELETE' && url.pathname.startsWith('/directories/')) {
            const dirPath = decodeURIComponent(url.pathname.substring('/directories/'.length));

            // Remove from file watcher
            ctx.fileWatcher.removeDirectory(dirPath);

            await ctx.directoryUseCase.remove(dirPath);
            sendJson(res, 200, { success: true });
            return;
        }

        // POST /stop
        if (req.method === 'POST' && url.pathname === '/stop') {
            sendJson(res, 200, { message: 'Server shutting down' });
            setTimeout(() => shutdown(), 100);
            return;
        }

        // 404
        sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
        logger.error('Request error', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        sendJson(res, 500, { error: message });
    }
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
    res.writeHead(status);
    res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

async function shutdown(): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info('Shutting down server...');

    stopIndexingLoop();

    if (context) {
        context.fileWatcher.stop();
        await context.processManager.clearPid();
    }

    closeDatabase();

    if (server) {
        server.close();
    }

    logger.info('Server stopped');
    process.exit(0);
}

async function main(): Promise<void> {
    try {
        context = await initContext();

        server = http.createServer((req, res) => {
            handleRequest(req, res, context!).catch(error => {
                logger.error('Unhandled request error', error);
                sendJson(res, 500, { error: 'Internal server error' });
            });
        });

        server.listen(context.config.server.port, '127.0.0.1', async () => {
            logger.info(`Similo server running on http://localhost:${context!.config.server.port}`);

            // Write PID file
            await context!.processManager.writePid(process.pid);

            // Initialize the file change queue with existing directories
            const directories = await context!.directoryRepo.findAll();
            const dirPaths = directories.map(d => d.path);
            await context!.fileChangeQueue.initialize(dirPaths);

            // Start file watcher for new changes
            context!.fileWatcher.start();

            // Start the background indexing loop
            startIndexingLoop(context!);
        });

        // Graceful shutdown handlers
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    } catch (error) {
        logger.error('Failed to start server', error);
        process.exit(1);
    }
}

main();
