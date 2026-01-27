export interface Directory {
    id: string;
    path: string;
    addedAt: Date;
    fileCount: number;
    lastIndexedAt: Date | null;
}

export interface CreateDirectoryInput {
    path: string;
}

export function createDirectory(input: CreateDirectoryInput): Directory {
    return {
        id: crypto.randomUUID(),
        path: input.path,
        addedAt: new Date(),
        fileCount: 0,
        lastIndexedAt: null
    };
}
