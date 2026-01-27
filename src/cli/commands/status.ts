import { Command } from 'commander';
import { ServerManager } from '../../application/ServerManager.js';
import { serverClient } from '../utils/serverClient.js';
import { formatStatus, formatError } from '../utils/output.js';

export const statusCommand = new Command('status')
    .description('Show server and index status')
    .option('-j, --json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
        const manager = new ServerManager();

        if (!(await manager.isRunning())) {
            if (options.json) {
                console.log(JSON.stringify({ status: 'stopped' }, null, 2));
            } else {
                console.log('Server is not running.');
                console.log('Start with: similo serve');
            }
            return;
        }

        const response = await serverClient.getStatus();

        if (!response.ok || !response.data) {
            console.error(formatError(response.error || 'Failed to get status'));
            process.exit(1);
        }

        console.log(formatStatus(response.data, options.json ?? false));
    });
