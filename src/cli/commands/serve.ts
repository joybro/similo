import { Command } from 'commander';
import { ServerManager } from '../../application/ServerManager.js';
import { formatSuccess } from '../utils/output.js';

export const serveCommand = new Command('serve')
    .description('Start the Similo server')
    .option('-f, --foreground', 'Run in foreground (not detached)')
    .action(async (options: { foreground?: boolean }) => {
        const manager = new ServerManager();

        if (await manager.isRunning()) {
            console.log(formatSuccess(`Server already running on port ${manager.getPort()}`));
            return;
        }

        if (options.foreground) {
            console.log('Starting server in foreground mode...');
            // This will block until server is stopped
            await manager.start(true);
        } else {
            console.log('Starting server...');
            await manager.start(false);
            console.log(formatSuccess(`Server started on port ${manager.getPort()}`));
        }
    });
