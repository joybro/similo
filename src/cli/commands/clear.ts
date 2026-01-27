import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as readline from 'readline';
import { getDbPath } from '../../domain/model/Config.js';
import { ServerManager } from '../../application/ServerManager.js';
import { formatSuccess } from '../utils/output.js';

export const clearCommand = new Command('clear')
    .description('Clear all indexes and registered directories')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(async (options: { force?: boolean }) => {
        if (!options.force) {
            const confirmed = await confirm(
                'This will delete all indexes and registered directories. Continue? (y/N) '
            );
            if (!confirmed) {
                console.log('Cancelled.');
                return;
            }
        }

        const manager = new ServerManager();

        // Stop server if running
        if (await manager.isRunning()) {
            console.log('Stopping server...');
            await manager.stop();
        }

        // Delete database file
        const dbPath = getDbPath();
        try {
            await fs.unlink(dbPath);
            console.log(`Deleted: ${dbPath}`);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                console.error(`Failed to delete database: ${error}`);
            }
        }

        console.log(formatSuccess('All indexes and directories cleared.'));
    });

function confirm(question: string): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}
