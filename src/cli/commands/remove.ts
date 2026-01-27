import { Command } from 'commander';
import { ServerManager } from '../../application/ServerManager.js';
import { serverClient } from '../utils/serverClient.js';
import { formatError, formatSuccess } from '../utils/output.js';

export const removeCommand = new Command('remove')
    .description('Remove a directory from watch and clear its index')
    .argument('<directory>', 'Directory path to remove')
    .action(async (directory: string) => {
        const manager = new ServerManager();

        // Ensure server is running
        if (!(await manager.isRunning())) {
            console.log('Starting Similo server...');
            await manager.start();
        }

        const response = await serverClient.removeDirectory(directory);

        if (!response.ok) {
            console.error(formatError(response.error || 'Failed to remove directory'));
            process.exit(1);
        }

        console.log(formatSuccess(`Directory removed: ${directory}`));
    });
