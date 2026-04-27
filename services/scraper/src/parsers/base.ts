/**
 * Parser 추상 클래스 — Phase 8 파서 공통 계약 (CRAWLING_STRATEGY §20 / SCHEMA §1).
 *
 * 역할:
 *   - HTML 문자열 → 엔티티 배열 변환 + 파싱 이슈 수집
 *   - `SELECTOR_VERSION` 으로 Serebii HTML 구조 변경(셀렉터 드리프트) 추적
 *   - Zod 검증은 각 파서가 `safeParse` 로 수행, 실패 엔티티는 `issues` 로 분리
 *
 * 책임 경계 (로더와 분리):
 *   - parser: 순수 파싱 + 스키마 검증 (네트워크/DB 접근 금지)
 *   - loader: DB upsert, `source_slug` / `content_hash` / `updated_at`, FK 해소
 *
 * scrapedAt 공통 주입 (§27.4):
 *   한 파서 호출이 여러 엔티티(+ i18n + 관계) 를 만들 때, 모든 엔티티의
 *   `scrapedAt` 은 동일 ISO 문자열을 공유해야 한다. ms 단위 drift 방지 + 감사
 *   재현성. `ParseOptions.scrapedAt` 을 전달하지 않으면 파서 구현이 호출 시점에
 *   한 번 생성해 `buildSourceMetadata` 에 일관 전달할 것.
 *
 * Zod 실패 격리:
 *   `safeParse` 실패는 `{kind: 'zod-fail', at, message}` 이슈로 기록하고 해당
 *   엔티티는 `entities` 에서 제외. 상위(loader)가 `data/invalid/` 격리 여부를
 *   결정. parser 는 throw 하지 않음 — 한 엔티티의 실패가 페이지 전체 실패로
 *   번지면 회복 탄력성이 떨어지기 때문.
 */

import type { SourceSite } from '@pokopia-wiki/shared';

/**
 * 파서 호출 시 전달되는 런타임 맥락.
 *
 * `sourceUrl` 은 모든 엔티티의 `SourceMetadata.sourceUrl` 로 주입된다. 페이지
 * 단위 파서는 페이지 URL 하나를 공유하고, 청크 단위 파서(habitat 209 상세 등)
 * 는 청크별 URL 을 각각 넘겨 호출한다.
 */
export type ParseOptions = {
  /** 엔티티 공통 sourceUrl. */
  sourceUrl: string;
  /**
   * 엔티티 그룹 공통 scrapedAt ISO8601. 미지정 시 파서가 호출 시점에 생성.
   * 동일 호출 안의 모든 엔티티가 같은 값을 쓰는지가 §27.4 요구 사항.
   */
  scrapedAt?: string;
};

/** 파싱 이슈 유형. `data/invalid/` 격리·리포트 분류용. */
export type ParseIssueKind =
  /** 기대한 섹션/블록이 HTML 에 없음. 페이지 레이아웃 변경 가능성. */
  | 'missing-section'
  /** 섹션은 있으나 하위 요소 shape 이 바뀜. 셀렉터 드리프트 주의. */
  | 'unexpected-structure'
  /** Zod safeParse 실패. 타입/제약 위반. */
  | 'zod-fail'
  /** 기타 (예: URL 정규화 불가, 숫자 변환 실패). */
  | 'other';

export type ParseIssue = {
  kind: ParseIssueKind;
  /** 위치 힌트 — 인덱스 번호, 셀렉터 경로, 또는 엔티티 키(`pokemon[24]`). */
  at?: string;
  message: string;
};

export type ParseResult<T> = {
  /** Zod 검증까지 통과한 엔티티. 출력 순서는 각 파서 구현이 결정. */
  entities: readonly T[];
  /** 파싱 중 축적된 이슈. 상위가 임계(≥5%) 판정 + 격리 결정에 사용. */
  issues: readonly ParseIssue[];
};

/**
 * 모든 Serebii/PokopiaGuide/... 파서의 공통 베이스.
 *
 * 하위 클래스는 **순수 함수 스타일**로 `parse` 를 구현한다 — 상태 없음, 외부
 * I/O 없음, 동일 입력 → 동일 출력. fixture 기반 회귀 테스트를 가능하게 하는
 * 핵심 제약.
 */
export abstract class Parser<T> {
  /** 셀렉터 드리프트 추적용. 구조 변경 감지 시 bump. */
  abstract readonly SELECTOR_VERSION: string;

  /** 파서가 담당하는 소스. 대부분 'serebii', 일부 pokopiaGuide 등. */
  abstract readonly sourceSite: SourceSite;

  /**
   * 페이지 식별자. fixture 파일명(`<pageId>.html`) · 리포트 매칭 키.
   * kebab-case 권장 (예: 'available-pokemon', 'crafting').
   */
  abstract readonly pageId: string;

  abstract parse(html: string, options: ParseOptions): ParseResult<T>;
}
