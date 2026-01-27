import { Command } from 'commander';
import { ServerManager } from '../../application/ServerManager.js';
import { serverClient } from '../utils/serverClient.js';
import { formatDirectoryList, formatError } from '../utils/output.js';

export const listCommand = new Command('list')
    .description('List registered directories')
    .option('-j, --json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
        const manager = new ServerManager();

        // Ensure server is running
        if (!(await manager.isRunning())) {
            console.log('Starting Similo server...');
            await manager.start();
        }

        const response = await serverClient.listDirectories();

        if (!response.ok || !response.data) {
            console.error(formatError(response.error || 'Failed to list directories'));
            process.exit(1);
        }

        console.log(formatDirectoryList(response.data.directories, options.json ?? false));
    });
