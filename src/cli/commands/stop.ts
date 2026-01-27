import { Command } from 'commander';
import { ServerManager } from '../../application/ServerManager.js';
import { formatSuccess } from '../utils/output.js';

export const stopCommand = new Command('stop')
    .description('Stop the Similo server')
    .action(async () => {
        const manager = new ServerManager();

        if (!(await manager.isRunning())) {
            console.log('Server is not running.');
            return;
        }

        console.log('Stopping server...');
        await manager.stop();
        console.log(formatSuccess('Server stopped.'));
    });
