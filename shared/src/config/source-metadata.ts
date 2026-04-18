/**
 * 소스별 기본 라이선스 / 저작권 / attribution 문자열 (CRAWLING_STRATEGY §27.4).
 *
 * 파서는 엔티티 생성 시 `buildSourceMetadata()` 를 통해 본 기본값을
 * 자동 주입한다. 사이트 정책 변경 시 이 파일 하나만 수정하면 된다.
 *
 * 원본 문자열은 SSoT(§27.4) 와 1:1 동일해야 한다 — 임의로 축약·번역 금지.
 */

import type { SourceMetadata, SourceSite } from '../validators/schemas/_base';

export const SOURCE_DEFAULTS: Record<
  SourceSite,
  Pick<SourceMetadata, 'license' | 'copyrightHolder' | 'attribution'>
> = {
  serebii: {
    license: 'Fan-use (non-commercial). Per Serebii.net content guidelines.',
    copyrightHolder: 'Game content © The Pokémon Company / Nintendo / GAME FREAK. Original writings © Serebii.net.',
    attribution: 'Data from Serebii.net — https://www.serebii.net/pokemonpokopia/',
  },
  pokopiaGuide: {
    license: 'Fan wiki, license unverified (treat as non-commercial fan-use)',
    copyrightHolder:
      'Game content © The Pokémon Company / Nintendo / GAME FREAK. Korean localization contributions © PokopiaGuide contributors.',
    attribution: 'Korean name mapping from PokopiaGuide — https://www.pokopiaguide.com/ko',
  },
  pokopoko: {
    license: 'Unknown (treat as non-commercial fan-use; re-evaluate before public release)',
    copyrightHolder: 'Game content © The Pokémon Company / Nintendo / GAME FREAK.',
    attribution: 'Korean translation from pokopoko.kr',
  },
  namuwiki: {
    license: 'CC BY-NC-SA 2.0 KR (namu.wiki default)',
    copyrightHolder:
      'Text © namu.wiki contributors (CC BY-NC-SA 2.0 KR). Game content © The Pokémon Company / Nintendo / GAME FREAK.',
    attribution: 'Content from namu.wiki (CC BY-NC-SA 2.0 KR) — https://namu.wiki',
  },
};
