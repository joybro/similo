import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, ensureSimiloDir } from '../domain/model/Config.js';
import { initDatabase, closeDatabase } from '../infrastructure/database/DatabaseManager.js';
import { SQLiteIndexRepository } from '../adapter/sqlite/SQLiteIndexRepository.js';
import { SQLiteDirectoryRepository } from '../adapter/sqlite/SQLiteDirectoryRepository.js';
import { OllamaEmbeddingProvider } from '../adapter/ollama/OllamaEmbeddingProvider.js';
import { FileReader } from '../infrastructure/filesystem/FileReader.js';
import { FileWatcher } from '../infrastructure/filesystem/FileWatcher.js';
import { IndexingService } from '../application/IndexingService.js';
import { SearchUseCase } from '../application/SearchUseCase.js';
import { DirectoryUseCase } from '../application/DirectoryUseCase.js';
import { FileChangeQueue } from '../services/FileChangeQueue.js';
import { registerTools } from './tools.js';
import logger from '../infrastructure/logger/index.js';

interface McpContext {
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
}

let context: McpContext | null = null;
let indexingLoopTimer: NodeJS.Timeout | null = null;
let isShuttingDown = false;

async function initContext(): Promise<McpContext> {
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

    // Set up file watcher to enqueue changes
    fileWatcher.onFileChange((path, eventType) => {
        if (eventType === 'unlink') {
            fileChangeQueue.enqueue({ path, reason: 'deleted' });
        } else {
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
        fileChangeQueue
    };
}

function startIndexingLoop(ctx: McpContext): void {
    const processNext = async () => {
        if (isShuttingDown) return;

        const changes = ctx.fileChangeQueue.poll(1);

        if (changes.length === 0) {
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

async function shutdown(): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info('Shutting down MCP server...');

    stopIndexingLoop();

    if (context) {
        context.fileWatcher.stop();
    }

    closeDatabase();

    logger.info('MCP server stopped');
    process.exit(0);
}

export async function startMcpServer(): Promise<void> {
    try {
        context = await initContext();

        const server = new McpServer({
            name: 'similo',
            version: '0.1.5'
        });

        // Register tools
        registerTools(server, context);

        // Initialize file change queue
        const directories = await context.directoryRepo.findAll();
        const dirPaths = directories.map(d => d.path);
        await context.fileChangeQueue.initialize(dirPaths);

        // Start file watcher
        context.fileWatcher.start();

        // Start background indexing loop
        startIndexingLoop(context);

        // Connect via stdio transport
        const transport = new StdioServerTransport();
        await server.connect(transport);

        logger.info('MCP server started');

        // Graceful shutdown handlers
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    } catch (error) {
        logger.error('Failed to start MCP server', error);
        process.exit(1);
    }
}

// Export context getter for tools
export function getContext(): McpContext {
    if (!context) {
        throw new Error('MCP context not initialized');
    }
    return context;
}

// Run if executed directly
const isDirectExecution = process.argv[1]?.endsWith('mcp/index.js') ||
    process.argv[1]?.endsWith('mcp/index.ts');

if (isDirectExecution) {
    startMcpServer();
}
