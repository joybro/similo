import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig, getLogPath, ensureSimiloDir } from '../domain/model/Config.js';
import { ProcessManager } from '../infrastructure/process/ProcessManager.js';
import logger from '../infrastructure/logger/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ServerManager {
    private processManager: ProcessManager;
    private port: number;

    constructor() {
        this.processManager = new ProcessManager();
        this.port = loadConfig().server.port;
    }

    async isRunning(): Promise<boolean> {
        // First check PID file
        const pidRunning = await this.processManager.isServerRunning();
        if (!pidRunning) {
            return false;
        }

        // Then verify server is actually responding
        try {
            const response = await fetch(`http://localhost:${this.port}/status`, {
                signal: AbortSignal.timeout(2000)
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    async start(foreground: boolean = false): Promise<void> {
        if (await this.isRunning()) {
            logger.info(`Server already running on port ${this.port}`);
            return;
        }

        const serverScript = path.resolve(__dirname, '../server/index.js');

        if (foreground) {
            // Import and run server directly
            logger.info('Starting server in foreground mode');
            await import('../server/index.js');
            return;
        }

        // Spawn detached process
        logger.info('Starting server in background');

        ensureSimiloDir();
        const logPath = getLogPath();
        const logFd = fs.openSync(logPath, 'a');

        const child = spawn(process.execPath, [serverScript], {
            detached: true,
            stdio: ['ignore', logFd, logFd],
            env: {
                ...process.env,
                SIMILO_DAEMON: '1'
            }
        });

        child.unref();
        fs.closeSync(logFd);

        // Wait for server to be ready
        await this.waitForServer(10, 500);

        logger.info(`Server started on port ${this.port}`);
    }

    async stop(): Promise<void> {
        const pid = await this.processManager.getServerPid();

        if (!pid) {
            logger.info('Server is not running');
            return;
        }

        try {
            // Try graceful shutdown via API first
            await fetch(`http://localhost:${this.port}/stop`, {
                method: 'POST',
                signal: AbortSignal.timeout(5000)
            });

            // Wait for process to exit
            await this.waitForExit(pid, 5, 500);
        } catch {
            // If API call fails, kill the process directly
            try {
                process.kill(pid, 'SIGTERM');
                await this.waitForExit(pid, 5, 500);
            } catch {
                // Process might already be gone
            }
        }

        await this.processManager.clearPid();
        logger.info('Server stopped');
    }

    async ensureRunning(): Promise<void> {
        if (!(await this.isRunning())) {
            await this.start();
        }
    }

    getPort(): number {
        return this.port;
    }

    private async waitForServer(maxRetries: number, intervalMs: number): Promise<void> {
        for (let i = 0; i < maxRetries; i++) {
            await this.sleep(intervalMs);

            try {
                const response = await fetch(`http://localhost:${this.port}/status`, {
                    signal: AbortSignal.timeout(1000)
                });
                if (response.ok) {
                    return;
                }
            } catch {
                // Continue waiting
            }
        }

        throw new Error(`Server failed to start within ${maxRetries * intervalMs}ms`);
    }

    private async waitForExit(pid: number, maxRetries: number, intervalMs: number): Promise<void> {
        for (let i = 0; i < maxRetries; i++) {
            if (!this.processManager.isProcessRunning(pid)) {
                return;
            }
            await this.sleep(intervalMs);
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
