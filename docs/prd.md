# Similo - Product Requirements Document

## Overview

**Similo**는 로컬 파일 및 문서를 대상으로 semantic search를 제공하는 도구다. Ollama에서 영감을 받아 macOS 메뉴바 앱, CLI, REST API를 통합 제공한다.

### 왜 Similo인가?

- 기존 grep 기반 검색은 키워드 매칭에 의존하여 개념적 검색에 한계가 있음
- 리포지토리에 코드뿐 아니라 디자인 문서, 도메인 지식 문서가 함께 있을 때 관련 문서를 찾기 어려움
- Claude Code 같은 AI 코딩 도구에서 semantic search를 skill로 활용하면 더 나은 컨텍스트 검색 가능
- 기존 도구들(Semantra, SeaGOAT 등)은 유지보수 중단되었거나 특정 용도(코드 전용)에 국한됨

### 이름의 유래

Similo = **Simi**lar + O**llo**ma 느낌. "비슷한 것을 찾아준다"는 의미를 담음.

---

## Target Users

1. **개발자** — 리포지토리 내 문서와 코드를 의미 기반으로 검색하고 싶은 사람
2. **AI 코딩 도구 사용자** — Claude Code 등에서 semantic search를 skill로 활용하려는 사람
3. **지식 관리자** — 로컬 문서 컬렉션에서 관련 정보를 빠르게 찾고 싶은 사람

---

## Core Features

### 1. macOS Menu Bar App

시스템 트레이에 상주하며 Similo 서버를 관리한다.

**기능:**

- 서버 상태 표시 (running/stopped)
- 서버 시작/정지
- 인덱싱 상태 및 진행률
- 설정 UI
    - 임베딩 모델 선택
    - Ollama 연결 설정
    - 인덱스 디렉토리 관리
    - 파일 타입 필터
- 로그 보기

### 2. CLI

터미널에서 Similo를 제어한다. Ollama와 마찬가지로 **서버가 필요한 명령 실행 시 서버가 없으면 자동으로 시작**한다.

```bash
# 검색
similo search <query>            # semantic search (서버 자동 시작)
similo search <query> --limit 10 # 결과 수 제한
similo search <query> --path ./docs # 특정 경로 내에서만 검색

# 인덱스 대상 관리
similo add <directory>           # watch 대상 추가 → 즉시 인덱싱 + 자동 watch
similo remove <directory>        # watch 대상 제거 + 인덱스 삭제
similo list                      # 등록된 디렉토리 목록

# 서버 관리 (보통 직접 사용할 일 없음)
similo serve                     # 명시적으로 서버 시작
similo serve --port 11435        # 포트 지정
similo status                    # 서버 및 인덱스 상태
similo stop                      # 서버 정지

# 인덱스 초기화
similo clear                     # 전체 인덱스 및 등록 디렉토리 초기화
```

**동작 방식:**
- `similo add <dir>`: 디렉토리를 등록하고 즉시 인덱싱. 이후 서버가 실행 중이면 자동으로 파일 변경 감지
- `similo search`, `similo add`, `similo list` 등 서버가 필요한 명령은 서버가 없으면 자동 시작
- 서버는 등록된 모든 디렉토리를 watch하며, 파일 변경 시 자동으로 재인덱싱

**AI 에이전트용 출력 형식:**

CLI는 사람뿐 아니라 AI 에이전트(Claude Code 서브에이전트 등)도 사용한다. 백그라운드 서브에이전트에서는 MCP를 사용할 수 없으므로 CLI가 유일한 접근 경로다.

- 모든 데이터 반환 명령에 `--json` 옵션 제공
- JSON 출력은 REST API 응답 형식과 동일하게 유지
- 에러도 JSON 형식으로 출력 (`{"error": "message"}`)

```bash
similo search "인증 설계" --json
# REST API /search 응답과 동일한 JSON 출력

similo list --json
similo status --json
```

### 3. REST API

다른 애플리케이션에서 Similo를 활용할 수 있게 한다.

**Base URL:** `http://localhost:11435`

**Endpoints:**

```
GET  /search?q=<query>&limit=<n>&path=<path>
     검색 수행

POST /directories
     Body: { "path": "<directory>" }
     watch 대상 디렉토리 추가 (즉시 인덱싱 + 자동 watch)

DELETE /directories/<path>
     watch 대상에서 제거 + 인덱스 삭제

GET  /directories
     등록된 디렉토리 목록

GET  /status
     서버 상태, 인덱스 통계
```

**Response Example (search):**

```json
{
    "results": [
        {
            "path": "./docs/auth-design.md",
            "chunk": "인증 시스템은 JWT 기반으로 설계되었으며...",
            "score": 0.87,
            "line_start": 45,
            "line_end": 52
        }
    ],
    "query": "인증 관련 설계",
    "took_ms": 23
}
```

---

## Architecture

```
┌─────────────────────────────────────────┐
│         macOS Menu Bar App              │
│  - Electron / Tauri                     │
│  - 상태 표시, 설정 UI                     │
└─────────────────┬───────────────────────┘
                  │ IPC / HTTP
                  ▼
┌─────────────────────────────────────────┐
│            Core Server                  │
│  - Node.js / Bun                        │
│  - REST API (localhost:11435)           │
│  - 파일 watcher (chokidar)              │
│  - 인덱스 관리                            │
└─────────────────┬───────────────────────┘
                  │
       ┌──────────┼──────────┐
       ▼          ▼          ▼
   Ollama     Vector DB    File System
 (임베딩 생성)  (SQLite +    (문서 읽기)
              vec 확장)
```

### Components

| 컴포넌트     | 역할                | 기술                          |
| ------------ | ------------------- | ----------------------------- |
| Menu Bar App | UI, 서버 관리       | Electron 또는 Tauri           |
| Core Server  | API, 인덱싱, 검색   | Node.js/Bun + Express/Fastify |
| CLI          | 터미널 인터페이스   | Commander.js 또는 oclif       |
| Vector Store | 임베딩 저장 및 검색 | SQLite + sqlite-vec           |
| File Watcher | 파일 변경 감지      | chokidar                      |
| Embeddings   | 텍스트 → 벡터       | Ollama API (Provider 패턴)    |

---

## Tech Stack

**Language:** TypeScript

**Runtime:** Node.js 또는 Bun

**Core Dependencies:**

- `commander` 또는 `oclif` — CLI 프레임워크
- `chokidar` — 파일 시스템 감시
- `better-sqlite3` + `sqlite-vec` — 벡터 저장소
- `ollama` — Ollama API 클라이언트
- `@langchain/textsplitters` — 텍스트 청킹 (필요시)

**Menu Bar App:**

- Option A: Electron + React
- Option B: Tauri + React (더 가벼움)

**Supported File Types (MVP):**

- `.md`, `.txt` — 텍스트 파일
- `.pdf` — PDF 문서 (pdf-parse)

---

## Data Model

### Index Entry

```typescript
interface IndexEntry {
    id: string;
    path: string; // 파일 경로
    chunk: string; // 텍스트 청크
    chunk_index: number; // 파일 내 청크 순서
    line_start: number; // 시작 라인
    line_end: number; // 끝 라인
    embedding: Float32Array; // 벡터 임베딩
    indexed_at: Date; // 인덱싱 시간
    file_modified_at: Date; // 파일 수정 시간
}
```

### Config

```typescript
interface SimiloConfig {
    ollama: {
        host: string; // default: "http://localhost:11434"
        model: string; // default: "nomic-embed-text"
    };
    server: {
        port: number; // default: 11435
    };
    indexing: {
        extensions: string[]; // default: [".md", ".txt"]
        ignore_patterns: string[]; // default: ["node_modules", ".git"]
        max_file_size: number; // default: 100KB, 초과 시 경고
    };
}
```

---

## Chunking & Search

### 인덱싱 (문서 → 벡터)

MVP에서는 파일 단위로 임베딩을 생성한다. 대부분의 문서가 작을 것으로 예상되므로 청킹은 일단 생략.

- 파일이 `max_file_size`를 초과하면 경고 로그 출력 후 건너뜀
- 추후 필요 시 `RecursiveCharacterTextSplitter` (LangChain) 도입 검토

### 검색 (쿼리 → 결과)

쿼리 텍스트를 임베딩하여 벡터 유사도 검색 수행.

- 쿼리가 길면 경고 출력 (임베딩 모델의 max token 초과 가능성)
- 파일별 최고 점수로 결과 반환

### Embedding Provider 패턴

임베딩 생성을 추상화하여 다양한 소스 지원:

```typescript
interface EmbeddingProvider {
    embed(text: string): Promise<number[]>;
    getModelName(): string;
}

// 구현체
class OllamaEmbeddingProvider implements EmbeddingProvider { }      // v0.1
class TransformersEmbeddingProvider implements EmbeddingProvider { } // v0.9
```

---

## MVP Scope (v0.1)

### In Scope

- [x] CLI: `similo add <dir>`, `similo search <query>`, `similo list`, `similo remove`
- [x] 서버 자동 시작 (CLI 명령 실행 시)
- [x] 파일 watch 및 자동 재인덱싱
- [x] Ollama 연동: 임베딩 생성
- [x] SQLite 벡터 저장소
- [x] 지원 파일: `.md`, `.txt`
- [x] 비동기 인덱싱 큐 (백그라운드 처리)

### Out of Scope (v0.1)

- MCP 서버 (v0.1.5에서 구현 예정)
- REST API (내부적으로는 사용, 외부 공개 API는 v0.2)
- macOS 메뉴바 앱
- PDF 지원
- 인증/보안

---

## Roadmap

### v0.1 — Foundation ✅

- CLI 기본 기능 (`add`, `search`, `list`, `remove`, `status`, `stop`, `clear`)
- 서버 자동 시작
- 파일 watch 및 자동 재인덱싱
- Ollama 임베딩 연동 (nomic-embed-text)
- SQLite + sqlite-vec 벡터 저장소
- 비동기 인덱싱 큐 (백그라운드 처리)

### v0.1.5 — MCP Server

- MCP 서버 (Claude Code 연동)

### v0.2 — REST API

- REST API 엔드포인트 공개
- 외부 애플리케이션 연동 지원

### v0.3 — Extended File Support

- PDF 지원

### v0.4 — Menu Bar App

- macOS 메뉴바 앱
- 설정 UI
- 상태 모니터링

### v0.9 — Self-contained Embeddings

- transformers.js 기반 자체 임베딩 모델 번들
- Ollama 없이도 동작 가능

### v1.0 — Production Ready

- 안정성 개선
- 성능 최적화
- 문서화

---

## Success Metrics

1. **기능 완성도**: MVP 기능이 의도대로 동작
2. **검색 품질**: 관련 문서가 상위 5개 결과에 포함되는 비율
3. **성능**: 1000개 문서 기준 검색 응답 < 100ms
4. **사용성**: 설치부터 첫 검색까지 5분 이내

---

## Open Questions

1. **크로스플랫폼**: macOS 우선, Windows/Linux는 언제?
2. **배포 방식**: npm? Homebrew? 둘 다?

---

## References

- [Ollama](https://github.com/ollama/ollama) — 아키텍처 참고
- [SeaGOAT](https://github.com/kantord/SeaGOAT) — 코드 semantic search
- [Semantra](https://github.com/freedmand/semantra) — 문서 semantic search
- [obsidian-similar-notes](https://github.com/joybro/obsidian-similar-notes) — 기존 플러그인 경험
