export interface IndexEntry {
    id: string;
    path: string;
    content: string;
    embedding: number[];
    indexedAt: Date;
    fileModifiedAt: Date;
    fileSize: number;
}

export interface CreateIndexEntryInput {
    path: string;
    content: string;
    embedding: number[];
    fileModifiedAt: Date;
    fileSize: number;
}

export function createIndexEntry(input: CreateIndexEntryInput): IndexEntry {
    return {
        id: crypto.randomUUID(),
        path: input.path,
        content: input.content,
        embedding: input.embedding,
        indexedAt: new Date(),
        fileModifiedAt: input.fileModifiedAt,
        fileSize: input.fileSize
    };
}
