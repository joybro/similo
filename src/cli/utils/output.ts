import type { SearchResult, DirectoryInfo, StatusResponse } from './serverClient.js';

export function formatSearchResults(results: SearchResult[], tookMs: number, json: boolean): string {
    if (json) {
        return JSON.stringify({ results, took_ms: tookMs }, null, 2);
    }

    if (results.length === 0) {
        return 'No results found.';
    }

    const lines: string[] = [];
    lines.push(`Found ${results.length} results (${tookMs}ms)\n`);

    for (const result of results) {
        const score = (result.score * 100).toFixed(1);
        lines.push(`[${score}%] ${result.path}`);

        // Show first 150 chars of content
        const preview = result.content
            .replace(/\n/g, ' ')
            .substring(0, 150)
            .trim();
        lines.push(`    ${preview}${result.content.length > 150 ? '...' : ''}`);
        lines.push('');
    }

    return lines.join('\n');
}

export function formatDirectoryList(directories: DirectoryInfo[], json: boolean): string {
    if (json) {
        return JSON.stringify({ directories }, null, 2);
    }

    if (directories.length === 0) {
        return 'No directories registered.';
    }

    const lines: string[] = [];
    lines.push(`Registered directories (${directories.length}):\n`);

    for (const dir of directories) {
        const lastIndexed = dir.lastIndexedAt
            ? new Date(dir.lastIndexedAt).toLocaleString()
            : 'never';
        lines.push(`  ${dir.path}`);
        lines.push(`    Files: ${dir.fileCount} | Last indexed: ${lastIndexed}`);
    }

    return lines.join('\n');
}

export function formatStatus(status: StatusResponse, json: boolean): string {
    if (json) {
        return JSON.stringify(status, null, 2);
    }

    return [
        `Similo Server Status`,
        `--------------------`,
        `Status: ${status.status}`,
        `Port: ${status.port}`,
        `Directories: ${status.directories}`,
        `Indexed files: ${status.indexedFiles}`,
        `Ollama model: ${status.ollamaModel}`
    ].join('\n');
}

export function formatError(message: string): string {
    return `Error: ${message}`;
}

export function formatSuccess(message: string): string {
    return message;
}
