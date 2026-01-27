import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SimiloConfig {
    ollama: {
        host: string;
        model: string;
    };
    server: {
        port: number;
    };
    indexing: {
        extensions: string[];
        ignorePatterns: string[];
        maxFileSize: number;
    };
}

export const DEFAULT_CONFIG: SimiloConfig = {
    ollama: {
        host: 'http://localhost:11434',
        model: 'nomic-embed-text'
    },
    server: {
        port: 11435
    },
    indexing: {
        extensions: ['.md', '.txt'],
        ignorePatterns: ['node_modules', '.git', '*.min.js', '*.min.css'],
        maxFileSize: 102400 // 100KB
    }
};

export function getSimiloDir(): string {
    return path.join(os.homedir(), '.similo');
}

export function getConfigPath(): string {
    return path.join(getSimiloDir(), 'config.json');
}

export function getDbPath(): string {
    return path.join(getSimiloDir(), 'index.db');
}

export function getPidPath(): string {
    return path.join(getSimiloDir(), 'similo.pid');
}

export function getLogPath(): string {
    return path.join(getSimiloDir(), 'similo.log');
}

export function ensureSimiloDir(): void {
    const dir = getSimiloDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

export function loadConfig(): SimiloConfig {
    const configPath = getConfigPath();

    if (!fs.existsSync(configPath)) {
        return DEFAULT_CONFIG;
    }

    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const userConfig = JSON.parse(content) as Partial<SimiloConfig>;
        return mergeConfig(DEFAULT_CONFIG, userConfig);
    } catch {
        return DEFAULT_CONFIG;
    }
}

export function saveConfig(config: SimiloConfig): void {
    ensureSimiloDir();
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf-8');
}

function mergeConfig(base: SimiloConfig, override: Partial<SimiloConfig>): SimiloConfig {
    return {
        ollama: {
            ...base.ollama,
            ...override.ollama
        },
        server: {
            ...base.server,
            ...override.server
        },
        indexing: {
            ...base.indexing,
            ...override.indexing
        }
    };
}
