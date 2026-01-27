import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SearchUseCase } from '../application/SearchUseCase.js';
import type { DirectoryUseCase } from '../application/DirectoryUseCase.js';
import type { SQLiteIndexRepository } from '../adapter/sqlite/SQLiteIndexRepository.js';
import type { SQLiteDirectoryRepository } from '../adapter/sqlite/SQLiteDirectoryRepository.js';
import type { FileChangeQueue } from '../services/FileChangeQueue.js';
import type { FileWatcher } from '../infrastructure/filesystem/FileWatcher.js';
import type { SimiloConfig } from '../domain/model/Config.js';
import { InvalidPathError, DirectoryNotFoundError } from '../application/DirectoryUseCase.js';
import logger from '../infrastructure/logger/index.js';

export interface ToolContext {
    config: SimiloConfig;
    searchUseCase: SearchUseCase;
    directoryUseCase: DirectoryUseCase;
    indexRepo: SQLiteIndexRepository;
    directoryRepo: SQLiteDirectoryRepository;
    fileChangeQueue: FileChangeQueue;
    fileWatcher: FileWatcher;
}

type ToolResult = {
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
};

function textResult(text: string, isError = false): ToolResult {
    return {
        content: [{ type: 'text' as const, text }],
        ...(isError && { isError: true })
    };
}

function registerSearchTool(server: McpServer, ctx: ToolContext): void {
    server.tool(
        'similo_search',
        'Search indexed documents using semantic similarity. Returns file paths, content snippets, and similarity scores.',
        {
            query: z.string().describe('The search query text'),
            limit: z.number().optional().describe('Maximum number of results (default: 10)'),
            path: z.string().optional().describe('Filter results to files within this directory path')
        },
        async ({ query, limit, path }) => {
            try {
                const results = await ctx.searchUseCase.search(query, {
                    limit: limit ?? 10,
                    path: path ?? undefined
                });

                if (results.length === 0) {
                    return textResult('No results found for the query.');
                }

                const formattedResults = results.map((r, i) => {
                    const scorePercent = (r.score * 100).toFixed(1);
                    return `[${i + 1}] ${r.path} (${scorePercent}% match)\n${r.content}`;
                }).join('\n\n---\n\n');

                return textResult(`Found ${results.length} result(s):\n\n${formattedResults}`);
            } catch (error) {
                logger.error('Search error:', error);
                const message = error instanceof Error ? error.message : 'Search failed';
                return textResult(`Error: ${message}`, true);
            }
        }
    );
}

function registerStatusTool(server: McpServer, ctx: ToolContext): void {
    server.tool(
        'similo_status',
        'Get Similo server status including index statistics and queue info.',
        {},
        async () => {
            try {
                const directories = await ctx.directoryRepo.findAll();
                const totalFiles = await ctx.indexRepo.count();
                const queuedFiles = ctx.fileChangeQueue.getCount();

                const text = [
                    'Similo Status:',
                    '- Status: running',
                    `- Registered directories: ${directories.length}`,
                    `- Indexed files: ${totalFiles}`,
                    `- Files in queue: ${queuedFiles}`,
                    `- Embedding model: ${ctx.config.ollama.model}`,
                    `- Ollama host: ${ctx.config.ollama.host}`
                ].join('\n');

                return textResult(text);
            } catch (error) {
                logger.error('Status error:', error);
                const message = error instanceof Error ? error.message : 'Failed to get status';
                return textResult(`Error: ${message}`, true);
            }
        }
    );
}

function registerListDirectoriesTool(server: McpServer, ctx: ToolContext): void {
    server.tool(
        'similo_list_directories',
        'List all registered directories that are being watched and indexed.',
        {},
        async () => {
            try {
                const directories = await ctx.directoryUseCase.list();

                if (directories.length === 0) {
                    return textResult('No directories registered. Use similo_add_directory to add one.');
                }

                const list = directories.map((d, i) => {
                    const fileCount = d.fileCount ?? 0;
                    const lastIndexed = d.lastIndexedAt
                        ? new Date(d.lastIndexedAt).toLocaleString()
                        : 'Never';
                    return `[${i + 1}] ${d.path}\n    Files: ${fileCount}, Last indexed: ${lastIndexed}`;
                }).join('\n\n');

                return textResult(`Registered directories (${directories.length}):\n\n${list}`);
            } catch (error) {
                logger.error('List directories error:', error);
                const message = error instanceof Error ? error.message : 'Failed to list directories';
                return textResult(`Error: ${message}`, true);
            }
        }
    );
}

function registerAddDirectoryTool(server: McpServer, ctx: ToolContext): void {
    server.tool(
        'similo_add_directory',
        'Register a directory for indexing and watching. Files will be indexed in the background.',
        {
            path: z.string().describe('Absolute or relative path to the directory to add')
        },
        async ({ path }) => {
            try {
                const result = await ctx.directoryUseCase.add(path);
                ctx.fileWatcher.addDirectory(result.directory.path);

                return textResult(
                    `Directory added: ${result.directory.path}\n` +
                    `Queued ${result.queuedCount} file(s) for indexing.`
                );
            } catch (error) {
                logger.error('Add directory error:', error);
                let message = 'Failed to add directory';
                if (error instanceof InvalidPathError || error instanceof Error) {
                    message = error.message;
                }
                return textResult(`Error: ${message}`, true);
            }
        }
    );
}

function registerRemoveDirectoryTool(server: McpServer, ctx: ToolContext): void {
    server.tool(
        'similo_remove_directory',
        'Unregister a directory and remove all its indexed files from the database.',
        {
            path: z.string().describe('Path to the directory to remove')
        },
        async ({ path }) => {
            try {
                ctx.fileWatcher.removeDirectory(path);
                await ctx.directoryUseCase.remove(path);

                return textResult(
                    `Directory removed: ${path}\n` +
                    'All indexed files from this directory have been deleted.'
                );
            } catch (error) {
                logger.error('Remove directory error:', error);
                let message = 'Failed to remove directory';
                if (error instanceof DirectoryNotFoundError || error instanceof Error) {
                    message = error.message;
                }
                return textResult(`Error: ${message}`, true);
            }
        }
    );
}

export function registerTools(server: McpServer, ctx: ToolContext): void {
    registerSearchTool(server, ctx);
    registerStatusTool(server, ctx);
    registerListDirectoriesTool(server, ctx);
    registerAddDirectoryTool(server, ctx);
    registerRemoveDirectoryTool(server, ctx);
}
