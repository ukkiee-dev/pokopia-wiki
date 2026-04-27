/**
 * NavigationPlanner — CRAWLING_STRATEGY §7.1, §7.4.
 *
 * 직접 URL goto 를 금지(§7.1)하고 홈 → 메뉴 → 목록 → 상세 경로를 사람이 클릭하듯
 * 따라간다. 서식지 209 개는 한 세션에 모두 방문하지 않고 6 세션에 분산(§7.4).
 *
 * ## 분산 청크 (SSoT §7.4)
 *
 *   - 세션 1: 1~20    (20)
 *   - 세션 2: 21~50   (30)
 *   - 세션 3: 51~80   (30)
 *   - 세션 4: 81~120  (40)
 *   - 세션 5: 121~160 (40)
 *   - 세션 6: 161~209 (49)
 *   합계: 209.
 *
 *   균등 분포가 아닌 이유는 §7.4 가 "초반 짧은 세션 → 후반 긴 세션" 패턴으로
 *   사용자 학습 곡선을 모델링하기 때문이다 (사람은 처음에 짧게 둘러보고 점점 더
 *   오래 머물게 된다). 변경 시 SSoT 와 함께 수정.
 *
 * ## DI
 *
 *   - `behavior`: HumanBehavior 인스턴스 (필수). 클릭·스크롤·dwell 위임.
 *   - `random`: maybeGoBack 의 80% 확률 deterministic 테스트용.
 */

import { asBehaviorLocator, type DriverPage } from '../browser/driver-page.js';
import type { BehaviorLocator, HumanBehavior, ScrollStyle } from './ghost-cursor.js';

/**
 * §7.4 청크 크기 — 합 209. 변경 시 §7.4 SSoT 와 동기화.
 */
const HABITAT_CHUNK_SIZES: readonly number[] = [20, 30, 30, 40, 40, 49];

export const HABITAT_SESSION_COUNT = HABITAT_CHUNK_SIZES.length;
export const HABITAT_TOTAL = HABITAT_CHUNK_SIZES.reduce((sum, size) => sum + size, 0);

export class NavigationPlanner {
  constructor(
    private readonly behavior: HumanBehavior,
    private readonly random: () => number = Math.random,
  ) {}

  /**
   * 홈 진입 — 직접 URL goto 가 허용되는 유일한 지점 (사용자가 북마크/탭 복원으로
   * 시작하는 시나리오 모델링).
   */
  async navigateHome(page: DriverPage, url: string): Promise<void> {
    await page.goto(url, { waitUntil: 'networkidle' });
    await this.behavior.humanDwell(3000, 8000);
    await this.behavior.humanScroll(page, 'partial');
  }

  /**
   * 셀렉터 매칭 첫 링크 클릭 (§7.1 메뉴/목록 단계).
   *
   * locator 는 매칭이 여러 개일 수 있어 `.first` 를 호출하지만, playwright/patchright
   * Locator 의 `.first()` generic 차이로 직접 chain 이 어렵다. capability 캐스트로
   * 간접 호출 — 실제로는 두 드라이버 모두 같은 시그니처.
   */
  async clickLink(page: DriverPage, selector: string): Promise<void> {
    const locator = page.locator(selector);
    // playwright/patchright Locator 모두 `.first()` 를 제공하지만 generic 차이로
    // 구조적 통합 불가 — asBehaviorLocator 단일 진입점으로 캐스트 (ARCH-602).
    const withFirst = asBehaviorLocator<{ first?: () => unknown }>(locator);
    const first = asBehaviorLocator<BehaviorLocator>(withFirst.first?.() ?? locator);
    await this.behavior.humanClick(page, first);
    await page.waitForLoadState('networkidle');
    await this.behavior.humanDwell(5000, 12000);
  }

  /**
   * 목록에서 특정 href 를 가진 링크 찾아 클릭. §7.1 의 "목록에서 타겟 링크 찾기"
   * 단계.
   */
  async clickListItem(page: DriverPage, hrefSubstring: string, scrollStyle: ScrollStyle = 'read-through'): Promise<void> {
    await this.behavior.humanScroll(page, scrollStyle);
    const selector = `a[href$="${hrefSubstring}"]`;
    const locator = asBehaviorLocator<BehaviorLocator>(page.locator(selector));
    await this.behavior.humanClick(page, locator);
    await page.waitForLoadState('networkidle');
    await this.behavior.humanDwell(5000, 12000);
  }

  /**
   * 80% 기본 확률로 뒤로가기 (§8.3). 호출자가 probability 를 0.5 등으로 낮출 수
   * 있도록 인자 노출.
   *
   * 반환값으로 발동 여부 알림 — 통계·로깅 호출자 책임.
   */
  async maybeGoBack(page: DriverPage, probability = 0.8): Promise<boolean> {
    if (this.random() >= probability) return false;
    await page.goBack();
    await this.behavior.humanDwell(2000, 5000);
    return true;
  }

  /**
   * §7.4 — 209 서식지를 6 세션 청크로 분산.
   *
   * sessionIndex 가 음수 / >= 6 이면 빈 배열 (호출자 보호 — 잘못된 세션 번호로
   * 빈 작업이 도는 게 throw 보다 부드럽다). 청크가 비어 있으면 호출자가 그
   * 세션을 skip.
   */
  static chunkHabitats<T>(all: readonly T[], sessionIndex: number): T[] {
    if (sessionIndex < 0 || sessionIndex >= HABITAT_SESSION_COUNT) return [];
    let cursor = 0;
    for (let i = 0; i < sessionIndex; i++) {
      cursor += HABITAT_CHUNK_SIZES[i]!;
    }
    const size = HABITAT_CHUNK_SIZES[sessionIndex]!;
    return all.slice(cursor, cursor + size);
  }
}
