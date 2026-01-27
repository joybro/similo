import { Command } from 'commander';
import { ServerManager } from '../../application/ServerManager.js';
import { serverClient } from '../utils/serverClient.js';
import { formatSearchResults, formatError } from '../utils/output.js';

export const searchCommand = new Command('search')
    .description('Search for similar content')
    .argument('<query>', 'Search query')
    .option('-l, --limit <number>', 'Maximum number of results', '10')
    .option('-p, --path <path>', 'Filter by directory path')
    .option('-j, --json', 'Output as JSON')
    .action(async (query: string, options: { limit: string; path?: string; json?: boolean }) => {
        const manager = new ServerManager();

        // Ensure server is running
        if (!(await manager.isRunning())) {
            console.log('Starting Similo server...');
            await manager.start();
        }

        const limit = parseInt(options.limit, 10);
        const response = await serverClient.search(query, limit, options.path);

        if (!response.ok || !response.data) {
            console.error(formatError(response.error || 'Search failed'));
            process.exit(1);
        }

        console.log(formatSearchResults(
            response.data.results,
            response.data.took_ms,
            options.json ?? false
        ));
    });
