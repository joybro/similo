export interface SearchResult {
    path: string;
    content: string;
    score: number;
}

export interface SearchOptions {
    limit?: number;
    path?: string;
    minScore?: number;
}

export const DEFAULT_SEARCH_OPTIONS: Required<SearchOptions> = {
    limit: 10,
    path: '',
    minScore: 0
};
