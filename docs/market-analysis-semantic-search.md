# 마크다운 문서 시맨틱 검색: 시장 분석 리포트

## Executive Summary

코드 검색은 grep으로 충분하지만, **자연어로 작성된 마크다운 문서**는 grep의 한계가 명확합니다. 이 분야의 도구들(SeaGOAT, Semantra, Reor, Smart Connections 등)이 주류가 되지 못한 이유와 dominant 제품이 없는 구조적 원인을 분석합니다.

---

## 1. 코드 vs 문서: 왜 grep이 다르게 작동하는가

### 코드에서 grep이 잘 작동하는 이유
- 함수명, 변수명, 클래스명은 **정확히 일치**해야 함
- `getUserById`를 찾으면 정확히 그 함수를 찾을 수 있음
- 코드는 구조화되어 있고, 명명 규칙이 일관됨

### 자연어 문서에서 grep이 실패하는 이유

> "grep 같은 단순 문자열 비교는 사용자가 원하는 결과에 근접하지 못합니다. 'car'가 'scar'에 매칭되는 false positive, 'goose'가 'geese'에 매칭되지 않는 false negative가 발생합니다."

| 문제 유형 | 예시 |
|----------|------|
| **동의어** | "인증" vs "로그인" vs "authentication" |
| **표현 다양성** | "API 호출 방법" vs "엔드포인트 사용법" |
| **문맥 의존** | "배포"가 DevOps인지 마케팅인지 |
| **시제/형태 변화** | "설정했다" vs "설정하는" vs "설정" |

---

## 2. 현재 시장의 도구들

### 2.1 전용 시맨틱 검색 도구

| 도구 | 상태 | 문제점 |
|-----|------|-------|
| **Semantra** | 사실상 중단 (2024.08) | 단일 개발자, 0.2.0 재설계 미완료 |
| **SeaGOAT** | 정체 (봇 업데이트만) | 코드 특화, 문서 검색에 최적화 안됨 |
| **Reor** | 활발히 개발 중 | 아직 초기 단계, 버그 존재 |
| **mgrep** | 신규 (2025) | CLI 전용, 범용성 제한 |

### 2.2 기존 PKM 도구의 플러그인

**Obsidian Smart Connections**
- 장점: 무료, 로컬, 빠른 유사 노트 검색
- 단점:
  - "시맨틱 쿼리가 일반 검색처럼 작동하지 않음. 쿼리 텍스트가 정확히 포함된 노트가 결과에 안 나올 수 있음"
  - "구현이 세련되지 않음(poor implementation)"
  - API 키 문제, UI 버그 등 기술적 이슈

**Obsidian Copilot**
- 장점: 더 세련된 구현, 강력한 LLM 활용
- 단점: 유료, 느림, 클라우드 의존

### 2.3 통합 솔루션

| 도구 | 접근 방식 |
|-----|----------|
| **Notion AI** | 클라우드 기반, 프라이버시 우려 |
| **Heptabase** | 시맨틱 검색 내장, 유료 |
| **Anytype** | 로컬 우선, 시맨틱 검색 제한적 |

---

## 3. 왜 이 문제가 어려운가

### 3.1 기술적 도전

#### 임베딩의 근본적 한계

> "임베딩 모델은 시맨틱 토큰의 bag으로 수렴하며, 학습 데이터 외의 쿼리에 대해 유연성이 부족합니다."

- 최고 성능 임베딩 모델도 recall@2가 **60% 미만**
- Reranker가 더 정확하지만 첫 단계 검색에는 너무 느림
- 쿼리와 문서 임베딩의 정렬(alignment) 실패가 검색 품질 저하의 근본 원인

#### 하이브리드 검색의 복잡성

```
이상적인 문서 검색 시스템:
├── 키워드 검색 (정확한 용어 매칭)
├── 시맨틱 검색 (의미 기반)
├── 쿼리 확장 (동의어, 관련어)
└── Reranking (최종 순위 조정)
```

각각 구현해야 하고, 가중치 조정도 필요함.

#### 신뢰도 문제

> "46%의 개발자가 AI 출력의 정확성을 신뢰하지 않음 - 2024년 31%에서 상승"

시맨틱 검색의 "black-box" 특성이 재현 가능한 결과가 필요한 도메인에서 문제가 됨.

### 3.2 UX 문제

#### 기대와 현실의 괴리

사용자는 "자연어로 질문하면 정확한 문서를 찾아줄 것"을 기대하지만:
- 모든 소스를 선택하면 처리가 느리고 결과가 혼란스러움
- 복잡한 스타일의 문서는 청킹이 어려움
- 컨텍스트 없이 청크만 반환하면 이해가 어려움

#### 설정 복잡성

로컬 시맨틱 검색 설정에 필요한 것:
1. 임베딩 모델 선택/설치
2. 벡터 DB 설정
3. 문서 인덱싱 (시간 소요)
4. 파라미터 튜닝

→ 대부분의 사용자에게 진입 장벽이 너무 높음

### 3.3 시장 역학

#### 통합 vs 독립

대기업들(Notion, Cursor, Obsidian)이 시맨틱 검색을 **기능**으로 흡수:
- 독립 도구 시장이 축소
- 플러그인/확장으로만 생존 가능

#### 오픈소스 지속가능성

- 60% 메인테이너가 무급
- 44%가 번아웃 경험
- 단일 개발자 프로젝트는 1-2년 내 정체

---

## 4. 현재 최선의 선택지

### 로컬 우선 + 프라이버시 중시

| 우선순위 | 추천 |
|---------|------|
| 1순위 | **Reor** - 가장 활발히 개발 중, 시맨틱 검색 핵심 기능 |
| 2순위 | **Obsidian + Smart Connections** - 기존 vault 활용 가능 |
| 3순위 | **Logseq + 커뮤니티 플러그인** - 아웃라이너 선호 시 |

### 하이브리드 접근

> "grep과 시맨틱 검색 둘 다 도구함에 있어야 합니다: 정확한 매칭엔 grep, 시맨틱 이해와 의도 파악엔 시맨틱 검색"

실용적 조합:
1. **빠른 키워드 검색**: grep/ripgrep으로 먼저 시도
2. **시맨틱 폴백**: 키워드로 못 찾으면 시맨틱 검색
3. **쿼리 확장**: LLM에게 검색어 변형을 요청

---

## 5. 결론: 왜 Dominant 제품이 없는가

### 핵심 원인

1. **기술 미성숙**: 자연어-자연어 시맨틱 매칭이 아직 연구 단계
2. **UX 장벽**: 설정 복잡성, 느린 인덱싱, 예측 불가능한 결과
3. **시장 흡수**: 대기업들이 기능으로 통합, 독립 제품 공간 축소
4. **지속가능성**: 오픈소스 단일 개발자 프로젝트의 한계
5. **신뢰 문제**: Black-box 결과에 대한 사용자 불신

### 시사점

마크다운 문서 시맨틱 검색은 **독립 제품보다는**:
- PKM 도구의 핵심 기능으로 통합
- 개발자 도구(Claude Code, Cursor 등)의 컨텍스트 검색으로 내장
- 특정 사용 사례에 특화된 vertical 솔루션

으로 진화할 가능성이 높습니다.

---

## Sources

### 시맨틱 검색 기술
- [On the Lost Nuance of Grep vs. Semantic Search](https://www.nuss-and-bolts.com/p/on-the-lost-nuance-of-grep-vs-semantic)
- [From grep to SPLADE: A Journey Through Semantic Search - Elicit](https://elicit.com/blog/semantic-search/)
- [mgrep - Semantic grep](https://github.com/mixedbread-ai/mgrep)

### PKM 도구
- [Reor GitHub](https://github.com/reorproject/reor)
- [Obsidian Smart Connections](https://github.com/brianpetro/obsidian-smart-connections)
- [Obsidian Smart Connections found holes in my PKM](https://medium.com/@brickbarnblog/obsidian-ai-plugin-smart-connections-found-some-big-holes-in-my-pkm-22830fa30b2a)

### 오픈소스 지속가능성
- [Open Source Maintainer Crisis](https://byteiota.com/open-source-maintainer-crisis-60-unpaid-burnout-hits-44/)
- [The Hidden Cost of Free](https://opensauced.pizza/blog/oss-sustainability)

### 문서 검색 트렌드
- [AI Documentation Trends 2025 - Mintlify](https://www.mintlify.com/blog/ai-documentation-trends-whats-changing-in-2025)
- [Semantic Search for Developer Portals](https://medium.com/@josellorian/crafting-intelligence-the-path-to-semantic-awareness-in-developer-portals-2d5a8a47c10a)
