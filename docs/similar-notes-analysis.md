# Similar Notes 플러그인 분석

이 문서는 [obsidian-similar-notes](https://github.com/joybro/obsidian-similar-notes) 플러그인의 구현을 분석하고, Similo 개발에 참고할 수 있는 내용을 정리한다.

> **참고**: 로컬에서 `~/Work/similar-notes`로 소스 코드에 직접 접근 가능

---

## 개요

Similar Notes는 Obsidian에서 현재 노트와 의미적으로 유사한 노트를 찾아주는 플러그인이다. Similo와 동일하게 semantic search를 제공하며, 로컬에서 임베딩을 생성하고 벡터 검색을 수행한다.

### 핵심 기능

- 현재 노트와 유사한 노트 자동 표시 (사이드바, 하단 패널)
- 로컬 임베딩 생성 (Transformers.js 또는 Ollama)
- 벡터 데이터베이스 기반 유사도 검색 (Orama)
- 증분 인덱싱 (변경된 파일만 재인덱싱)

---

## 아키텍처

### 디렉토리 구조

```
src/
├── adapter/              # 외부 연동 (Orama, Ollama, HuggingFace)
├── application/          # 애플리케이션 서비스 (오케스트레이션)
├── commands/             # 커맨드 팔레트 구현
├── components/           # React UI 컴포넌트
├── domain/               # 핵심 비즈니스 로직
│   ├── model/            # 도메인 엔티티 (Note, NoteChunk, SimilarNote)
│   ├── repository/       # 리포지토리 인터페이스
│   └── service/          # 도메인 서비스 (EmbeddingService, SimilarNoteFinder)
├── infrastructure/       # 인프라 구현 (IndexedDB, VaultNoteRepository)
├── services/             # 레거시 서비스 (NoteChangeQueue)
├── utils/                # 유틸리티 함수
└── main.ts               # 플러그인 진입점
```

**설계 패턴**: DDD(Domain-Driven Design) + Hexagonal Architecture

- `domain/`: 순수 비즈니스 로직 (외부 의존성 없음)
- `adapter/`: 외부 시스템 연동 구현
- `infrastructure/`: 저장소 구현
- `application/`: 유스케이스 조율

### Similo에 적용

Similo도 유사한 구조를 채택하면 좋다:

```
src/
├── domain/               # 핵심 로직 (인덱싱, 검색, 청킹)
├── adapter/              # Ollama, SQLite-vec 연동
├── infrastructure/       # 파일 시스템, 데이터베이스 구현
├── application/          # CLI/API 유스케이스 조율
├── cli/                  # CLI 명령어
└── server/               # REST API 서버
```

---

## 유사도 계산 알고리즘

### 청킹 전략

Similar Notes는 LangChain의 `RecursiveCharacterTextSplitter`를 사용한다:

```typescript
// src/domain/service/NoteChunkingService.ts
const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: maxTokens,      // 기본값: 모델에 따라 다름
    chunkOverlap: 100,         // 청크 간 중복 (컨텍스트 유지)
    separators: ["\n\n", "\n", " ", ""]  // 마크다운 친화적
});
```

**핵심 포인트**:
- 청크 오버랩 (100 토큰)으로 문맥 유실 방지
- 마크다운 구조에 맞는 분리자 우선순위
- 토큰 수 기준으로 청킹 (글자 수 아님)

### 유사도 검색 흐름

```
1. 현재 노트를 청크로 분할
2. 각 청크의 임베딩 생성 (또는 캐시에서 로드)
3. 각 청크별로 유사한 청크 검색 (벡터 유사도)
4. 노트 경로 기준으로 중복 제거 (최고 점수 유지)
5. 점수순 정렬 후 상위 N개 반환
```

```typescript
// src/domain/service/SimilarNoteFinder.ts
async findSimilarNotes(note: Note, limit = 5): Promise<SimilarNote[]> {
    // 현재 노트 + 링크된 노트는 제외
    const excludePaths = [note.path, ...note.links];

    // 청크별 유사 검색 후 노트 단위로 집계
    const results = await Promise.all(
        noteChunks.map(chunk =>
            this.noteChunkRepository.findSimilarChunks(
                chunk.embedding,
                15,            // 청크당 15개 검색
                0,
                excludePaths
            )
        )
    );

    // 노트별 최고 점수로 집계
    return this.aggregateByNote(results, limit);
}
```

### Similo에 적용

- 청크 오버랩 설정 추가 (PRD에 `chunk_overlap: 50` 있음)
- 노트 경로 제외 기능은 Similo에서는 불필요 (단일 쿼리 검색)
- 청크별 검색 후 파일별 집계 로직 참고

---

## 임베딩 서비스

### Provider 패턴

Similar Notes는 두 가지 임베딩 소스를 지원한다:

```typescript
// src/domain/service/EmbeddingService.ts
abstract class EmbeddingProvider {
    abstract embedText(text: string): Promise<number[]>;
    abstract getModelName(): string;
}

// 구현체
class TransformersEmbeddingProvider extends EmbeddingProvider { }  // 로컬
class OllamaEmbeddingProvider extends EmbeddingProvider { }        // 외부
```

**장점**:
- 런타임에 프로바이더 교체 가능
- 테스트 용이성 (Mock 주입)
- 새로운 프로바이더 추가 용이

### Web Worker 활용

Transformers.js 임베딩은 CPU 집약적이므로 Web Worker에서 실행:

```typescript
// src/adapter/TransformersEmbeddingProvider.ts
class WorkerManager<T> {
    async initialize(WorkerConstructor): Promise<Comlink.Remote<T>>
    async dispose(): Promise<void>
}

// Comlink로 Worker 통신 추상화
const worker = await this.workerManager.initialize(TransformersWorker);
const embedding = await worker.embed(text);
```

### GPU 폴백

```typescript
try {
    return await this.tryLoadModel(modelId, useGPU=true);
} catch (error) {
    if (isGPUError(error)) {
        // GPU 실패 시 CPU로 폴백
        return await this.tryLoadModel(modelId, useGPU=false);
    }
}
```

### Similo에 적용

- Provider 패턴 채택으로 Ollama 외 다른 소스 지원 대비 (v0.9 transformers.js)
- Node.js에서는 Worker Thread 사용 검토
- GPU 폴백은 Node.js 환경에서는 덜 중요 (Ollama가 처리)

---

## 벡터 저장소

### 이중 레이어 저장

Similar Notes는 **Orama (인메모리)** + **IndexedDB (영속화)** 조합을 사용:

```typescript
// src/infrastructure/IndexedDBChunkStorage.ts
class IndexedDBChunkStorage {
    // 시작 시: IndexedDB → Orama 로드
    async loadAll(): Promise<void> {
        const chunks = await this.getAllFromIndexedDB();
        await this.oramaStore.bulkInsert(chunks);  // 배치 로드 (100개씩)
    }

    // 저장 시: 양쪽 동시 저장
    async save(chunk: NoteChunk): Promise<void> {
        await this.oramaStore.insert(chunk);
        await this.indexedDB.put(chunk);
    }
}
```

### Similo 비교

| 항목 | Similar Notes | Similo (계획) |
|------|---------------|---------------|
| 벡터 DB | Orama (인메모리) | SQLite + sqlite-vec |
| 영속화 | IndexedDB | SQLite 파일 |
| 장점 | 빠른 검색 | 단일 파일, CLI 친화적 |

SQLite-vec는 이미 영속화를 제공하므로 이중 레이어가 불필요하다. 다만 시작 시 인덱스 로딩 최적화는 참고할 만하다.

---

## 증분 인덱싱

### 변경 감지

Similar Notes는 파일 수정 시간을 추적하여 변경된 파일만 재인덱싱:

```typescript
// src/services/NoteChangeQueue.ts
class NoteChangeQueue {
    // IndexedDB에 파일별 mtime 저장
    private lastModifiedTimes: Map<string, number>;

    async checkForChanges(): Promise<void> {
        for (const file of allFiles) {
            const storedMtime = this.lastModifiedTimes.get(file.path);
            if (file.mtime > storedMtime) {
                this.queueForReindex(file);
            }
        }
    }
}
```

### 백그라운드 처리

```typescript
// 1초 간격 폴링 루프
private async startLoop(): Promise<void> {
    while (this.running) {
        const batch = this.queue.splice(0, 10);  // 10개씩 처리
        await this.processBatch(batch);
        await sleep(1000);
    }
}
```

### Similo에 적용

PRD에 이미 chokidar 기반 파일 감시가 계획되어 있다. Similar Notes의 접근법과 비교:

| Similar Notes | Similo (계획) |
|---------------|---------------|
| 폴링 (1초 간격) | 이벤트 기반 (chokidar) |
| IndexedDB에 mtime 저장 | SQLite에 mtime 저장 |

chokidar의 이벤트 기반 방식이 더 효율적이다. 다만 다음 사항 참고:
- 서버 재시작 시 mtime 비교로 변경 파일 감지
- 배치 처리로 대량 변경 시 부하 분산

---

## 캐싱 전략

### 결과 캐시

```typescript
// src/application/SimilarNoteCoordinator.ts
private cache = new Map<string, SimilarNoteCacheEntry>();
const MAX_CACHE_SIZE = 20;  // LRU 스타일

interface SimilarNoteCacheEntry {
    results: SimilarNote[];
    timestamp: number;
}

// 설정 변경 시 캐시 무효화
settingsService.getNewSettingsObservable().subscribe(() => {
    this.cache.clear();
});
```

### Similo에 적용

REST API 환경에서의 캐싱 고려:
- 검색 결과 캐싱 (쿼리 + 파라미터 기준)
- 파일 변경 시 관련 캐시 무효화
- TTL 기반 만료

---

## Vault 격리

```typescript
// 멀티 Vault 지원을 위한 격리
const vaultId = this.app.appId as string;
const dbName = `${vaultId}-similar-notes`;
```

### Similo에 적용

Similo는 여러 디렉토리를 독립적으로 관리해야 한다:
- 디렉토리별 인덱스 구분 (또는 단일 인덱스에 경로 필터)
- `similo search --path ./docs` 같은 경로 제한 검색 지원

---

## 설정 관리

### Observable 기반 설정 전파

```typescript
// src/domain/service/SimiloSettingsService.ts
class SettingsService {
    private settingsSubject = new BehaviorSubject<Settings>(defaultSettings);

    getNewSettingsObservable(): Observable<Settings> {
        return this.settingsSubject.asObservable();
    }

    updateSettings(newSettings: Settings): void {
        this.settingsSubject.next(newSettings);
        // → 모든 구독자에게 변경 전파
    }
}
```

### Similo에 적용

CLI/서버 환경에서는 RxJS 대신:
- 설정 파일 변경 감지 (chokidar)
- 이벤트 이미터 패턴
- 또는 API 엔드포인트로 설정 변경

---

## 핵심 의존성

| 라이브러리 | 용도 | Similo 대응 |
|------------|------|-------------|
| `@huggingface/transformers` | 로컬 임베딩 | Ollama (MVP), transformers.js (v0.9) |
| `@orama/orama` | 벡터 검색 | `sqlite-vec` |
| `@langchain/textsplitters` | 청킹 | 직접 구현 또는 동일 사용 |
| `comlink` | Worker 통신 | Node.js Worker Thread |
| `rxjs` | 리액티브 | EventEmitter 또는 유지 |
| `picomatch` | glob 매칭 | `micromatch` 또는 동일 |

---

## 주요 배움점 요약

### 1. 아키텍처
- **DDD + Hexagonal** 구조가 확장성과 테스트에 유리
- Provider 패턴으로 임베딩 소스 추상화

### 2. 성능
- **청크 오버랩**으로 컨텍스트 유지 (100 토큰)
- **배치 처리**로 대량 인덱싱 시 부하 분산
- **결과 캐싱**으로 반복 검색 최적화
- **증분 인덱싱**으로 불필요한 재인덱싱 방지

### 3. 알고리즘
- 청크 단위 검색 후 **파일별 집계** (최고 점수)
- 현재 노트와 링크된 노트 **자동 제외**

### 4. 안정성
- **GPU 폴백**: GPU 실패 시 CPU로 자동 전환
- **버전 마이그레이션**: 업그레이드 시 자동 재인덱싱

### 5. 사용자 경험
- 설정 변경 시 **즉시 반영** (Observable)
- **백그라운드 인덱싱**으로 UI 블로킹 방지

---

## 다음 단계

Similo 구현 시 Similar Notes에서 직접 참고할 수 있는 코드:

1. `RecursiveCharacterTextSplitter` 설정 → 청킹 서비스
2. 증분 인덱싱 mtime 비교 로직 → 파일 감시 서비스
3. Provider 패턴 → Ollama/Transformers.js 추상화
4. 청크별 검색 후 집계 로직 → 검색 서비스

