import log from 'loglevel';

// Set default log level based on environment
const defaultLevel = process.env['SIMILO_LOG_LEVEL'] || 'info';
log.setLevel(defaultLevel as log.LogLevelDesc);

export const logger = {
    debug: (message: string, ...args: unknown[]) => log.debug(`[DEBUG] ${message}`, ...args),
    info: (message: string, ...args: unknown[]) => log.info(`[INFO] ${message}`, ...args),
    warn: (message: string, ...args: unknown[]) => log.warn(`[WARN] ${message}`, ...args),
    error: (message: string, ...args: unknown[]) => log.error(`[ERROR] ${message}`, ...args),
    setLevel: (level: log.LogLevelDesc) => log.setLevel(level)
};

export default logger;
