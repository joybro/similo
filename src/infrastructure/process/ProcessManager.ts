import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { getPidPath } from '../../domain/model/Config.js';
import logger from '../logger/index.js';

export class ProcessManager {
    private pidPath: string;

    constructor(pidPath?: string) {
        this.pidPath = pidPath || getPidPath();
    }

    async writePid(pid: number): Promise<void> {
        await fs.writeFile(this.pidPath, pid.toString(), 'utf-8');
        logger.debug(`PID file written: ${pid}`);
    }

    async readPid(): Promise<number | null> {
        try {
            if (!existsSync(this.pidPath)) {
                return null;
            }
            const content = await fs.readFile(this.pidPath, 'utf-8');
            const pid = parseInt(content.trim(), 10);
            return isNaN(pid) ? null : pid;
        } catch {
            return null;
        }
    }

    async clearPid(): Promise<void> {
        try {
            if (existsSync(this.pidPath)) {
                await fs.unlink(this.pidPath);
                logger.debug('PID file cleared');
            }
        } catch (error) {
            logger.warn('Failed to clear PID file', error);
        }
    }

    isProcessRunning(pid: number): boolean {
        try {
            // Sending signal 0 tests if process exists
            process.kill(pid, 0);
            return true;
        } catch {
            return false;
        }
    }

    async isServerRunning(): Promise<boolean> {
        const pid = await this.readPid();

        if (pid === null) {
            return false;
        }

        const running = this.isProcessRunning(pid);

        // Clean up stale PID file
        if (!running) {
            await this.clearPid();
        }

        return running;
    }

    async getServerPid(): Promise<number | null> {
        const pid = await this.readPid();

        if (pid === null) {
            return null;
        }

        if (!this.isProcessRunning(pid)) {
            await this.clearPid();
            return null;
        }

        return pid;
    }
}
