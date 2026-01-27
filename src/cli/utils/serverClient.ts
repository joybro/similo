import { loadConfig } from '../../domain/model/Config.js';

const config = loadConfig();
const BASE_URL = `http://localhost:${config.server.port}`;

export interface ApiResponse<T> {
    ok: boolean;
    status: number;
    data?: T;
    error?: string;
}

async function request<T>(
    method: string,
    path: string,
    body?: unknown
): Promise<ApiResponse<T>> {
    try {
        const response = await fetch(`${BASE_URL}${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(30000)
        });

        const data = await response.json() as T;

        if (!response.ok) {
            return {
                ok: false,
                status: response.status,
                error: (data as { error?: string }).error || 'Request failed'
            };
        }

        return {
            ok: true,
            status: response.status,
            data
        };
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            return {
                ok: false,
                status: 0,
                error: 'Request timeout'
            };
        }

        return {
            ok: false,
            status: 0,
            error: error instanceof Error ? error.message : 'Connection failed'
        };
    }
}

export const serverClient = {
    getStatus: () => request<StatusResponse>('GET', '/status'),

    search: (query: string, limit?: number, path?: string) => {
        const params = new URLSearchParams({ q: query });
        if (limit) params.set('limit', limit.toString());
        if (path) params.set('path', path);
        return request<SearchResponse>('GET', `/search?${params}`);
    },

    addDirectory: (path: string) =>
        request<AddDirectoryResponse>('POST', '/directories', { path }),

    removeDirectory: (path: string) =>
        request<{ success: boolean }>('DELETE', `/directories/${encodeURIComponent(path)}`),

    listDirectories: () =>
        request<ListDirectoriesResponse>('GET', '/directories'),

    stop: () =>
        request<{ message: string }>('POST', '/stop')
};

export interface StatusResponse {
    status: string;
    port: number;
    directories: number;
    indexedFiles: number;
    queuedFiles: number;
    ollamaModel: string;
}

export interface SearchResult {
    path: string;
    content: string;
    score: number;
}

export interface SearchResponse {
    results: SearchResult[];
    query: string;
    took_ms: number;
}

export interface DirectoryInfo {
    id: string;
    path: string;
    addedAt: string;
    fileCount: number;
    lastIndexedAt: string | null;
}

export interface AddDirectoryResponse {
    directory: DirectoryInfo;
    queuedCount: number;
}

export interface ListDirectoriesResponse {
    directories: DirectoryInfo[];
}
