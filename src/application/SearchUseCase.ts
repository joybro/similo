import type { SearchResult, SearchOptions } from '../domain/model/SearchResult.js';
import { DEFAULT_SEARCH_OPTIONS } from '../domain/model/SearchResult.js';
import type { IndexRepository } from '../domain/repository/IndexRepository.js';
import type { EmbeddingProvider } from '../domain/service/EmbeddingProvider.js';
import logger from '../infrastructure/logger/index.js';

export class SearchUseCase {
    constructor(
        private indexRepo: IndexRepository,
        private embeddingProvider: EmbeddingProvider
    ) {}

    async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
        const opts = { ...DEFAULT_SEARCH_OPTIONS, ...options };

        logger.debug(`Searching: "${query}" with options:`, opts);

        // Generate embedding for query
        const queryEmbedding = await this.embeddingProvider.embed(query);

        // Search for similar entries
        const results = await this.indexRepo.findSimilar(
            queryEmbedding,
            opts.limit,
            opts.path || undefined
        );

        // Filter by min score and map to SearchResult
        const searchResults: SearchResult[] = results
            .filter(r => r.score >= opts.minScore)
            .map(r => ({
                path: r.entry.path,
                content: r.entry.content,
                score: r.score
            }));

        logger.debug(`Found ${searchResults.length} results`);

        return searchResults;
    }
}
