import { Ollama } from 'ollama';
import type { EmbeddingProvider } from '../../domain/service/EmbeddingProvider.js';
import logger from '../../infrastructure/logger/index.js';

export class OllamaEmbeddingProvider implements EmbeddingProvider {
    private client: Ollama;
    private model: string;
    private dimensions: number = 768; // nomic-embed-text default

    constructor(host: string, model: string) {
        this.client = new Ollama({ host });
        this.model = model;
        logger.debug(`OllamaEmbeddingProvider initialized with host=${host}, model=${model}`);
    }

    async embed(text: string): Promise<number[]> {
        try {
            const response = await this.client.embeddings({
                model: this.model,
                prompt: text
            });

            if (!response.embedding || response.embedding.length === 0) {
                throw new Error('Empty embedding returned from Ollama');
            }

            // Update dimensions if different
            if (response.embedding.length !== this.dimensions) {
                this.dimensions = response.embedding.length;
                logger.debug(`Updated embedding dimensions to ${this.dimensions}`);
            }

            return response.embedding;
        } catch (error) {
            this.handleError(error);
            throw error;
        }
    }

    async embedBatch(texts: string[]): Promise<number[][]> {
        // Ollama doesn't have native batch embedding, so we process sequentially
        // TODO: Consider parallel processing with rate limiting
        const results: number[][] = [];

        for (const text of texts) {
            const embedding = await this.embed(text);
            results.push(embedding);
        }

        return results;
    }

    getModelName(): string {
        return this.model;
    }

    getDimensions(): number {
        return this.dimensions;
    }

    async testConnection(): Promise<{ success: boolean; error?: 'connection_failed' | 'model_not_found' }> {
        try {
            const response = await this.client.embeddings({
                model: this.model,
                prompt: 'test'
            });
            // Update dimensions from actual response
            if (response.embedding && response.embedding.length > 0) {
                this.dimensions = response.embedding.length;
                logger.debug(`Ollama connection test successful, dimensions=${this.dimensions}`);
            }
            return { success: true };
        } catch (error) {
            // Check if model not found
            if (error instanceof Error) {
                if (error.message.includes('not found') || error.message.includes('404')) {
                    return { success: false, error: 'model_not_found' };
                }
            }
            return { success: false, error: 'connection_failed' };
        }
    }

    private handleError(error: unknown): void {
        if (error instanceof Error) {
            // Connection refused
            if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
                logger.error('Cannot connect to Ollama. Is it running? Start with: ollama serve');
                throw new OllamaConnectionError(
                    'Cannot connect to Ollama. Is it running? Start with: ollama serve'
                );
            }

            // Model not found
            if (error.message.includes('not found') || error.message.includes('404')) {
                logger.error(`Model '${this.model}' not found. Run: ollama pull ${this.model}`);
                throw new OllamaModelNotFoundError(
                    `Model '${this.model}' not found. Run: ollama pull ${this.model}`
                );
            }

            // Context length exceeded
            if (error.message.includes('context length') || error.message.includes('input length')) {
                throw new ContextLengthExceededError(
                    'Input text exceeds model context length'
                );
            }
        }
    }
}

export class OllamaConnectionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OllamaConnectionError';
    }
}

export class OllamaModelNotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OllamaModelNotFoundError';
    }
}

export class ContextLengthExceededError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ContextLengthExceededError';
    }
}
