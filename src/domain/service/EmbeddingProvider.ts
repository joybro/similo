export interface EmbeddingProvider {
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
    getModelName(): string;
    getDimensions(): number;
    testConnection(): Promise<boolean>;
}
