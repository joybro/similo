import { Command } from 'commander';
import { ServerManager } from '../../application/ServerManager.js';
import { serverClient } from '../utils/serverClient.js';
import { formatError, formatSuccess } from '../utils/output.js';

export const addCommand = new Command('add')
    .description('Add a directory to watch and index')
    .argument('<directory>', 'Directory path to add')
    .action(async (directory: string) => {
        const manager = new ServerManager();

        // Ensure server is running
        if (!(await manager.isRunning())) {
            console.log('Starting Similo server...');
            await manager.start();
        }

        console.log(`Adding directory: ${directory}`);

        const response = await serverClient.addDirectory(directory);

        if (!response.ok || !response.data) {
            console.error(formatError(response.error || 'Failed to add directory'));
            process.exit(1);
        }

        const { directory: dir, indexing } = response.data;

        console.log(formatSuccess([
            `Directory added: ${dir.path}`,
            `Indexed: ${indexing.indexed} files`,
            indexing.skipped > 0 ? `Skipped: ${indexing.skipped} files` : '',
            indexing.errors > 0 ? `Errors: ${indexing.errors}` : ''
        ].filter(Boolean).join('\n')));
    });
