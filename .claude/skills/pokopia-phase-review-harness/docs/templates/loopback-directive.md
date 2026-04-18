# 루프백 지시서 템플릿

`VERDICT: LOOP_REQUIRED`일 때 생성되는 `loopback_directive.md`의 구조. 구현자에게 전달할 수정 지시를 담는다.

---

## Template

```markdown
# Loopback Directive — Phase {N} ({type}) Loop {loop_count+1}

**Generated:** {timestamp}
**From audit:** `_workspace/audit/phase-{N}/{ts}/REPORT.md`
**Target loop count:** {loop_count+1}

## Summary

Critical {n}건 해결 필요. 다음 구현 스킬 재호출로 수정:

- {implementer-1}: {n}건 담당
- {implementer-2}: {n}건 담당
- manual: {n}건 (사용자 수동 수정 필요)

재감사 시 `prev_status` 태그로 해결 여부를 확인하므로, **수정 후 반드시 이 지시서를 참조하여 각 항목이 해결되었는지 스스로 점검**한 뒤 완료 선언.

## 필수 수정 사항 (Critical)

### {implementer-1} 담당 ({n}건)

#### [C-001] {rule} — {file}:{line}

- **evidence:** {증거}
- **suggestion:** {제안}
- **해결 조건:** {구체적 성공 기준, 예: "cooking.ingredient_item_slug가 item 테이블에 존재하는 slug만 참조하도록 수정. 재감사 시 교차 참조 쿼리가 0 NULL 반환해야 함"}
- **관련 finding:** C-003 (교차 이슈, 함께 수정 권장)

#### [C-002] ...
{동일 포맷}

### {implementer-2} 담당 ({n}건)
{동일 포맷}

### manual 담당 ({n}건)

사용자가 직접 수정해야 하는 항목. 자동 구현자 없음.

#### [C-007] {rule} — {file}:{line}
- **evidence:** {증거}
- **suggestion:** {제안}
- **왜 manual인가:** {예: "계획 문서(SCHEMA.md) 자체의 수정 필요, 코드 스킬로 처리 불가"}

## 참고 사항 (Warning) — 선택적

{Warning 건들은 이번 루프에서 해결 권장하지만 필수 아님}

#### [W-001] ...

## 수정 후 작업

1. 구현 스킬이 수정 완료
2. 하네스 재진입: `pokopia-phase-review-harness` 다시 호출
   - `phase`, `type`은 동일
   - `artifacts`는 변경된 파일 목록 (이전과 동일 + 추가 파일 있을 수 있음)
   - `prev_report`: 이 루프백 지시서가 참조한 리포트 경로
   - `loop_count`: {loop_count+1}

## 재감사 기대치

- Critical {n}건 모두 `prev_status: resolved`
- 새 Critical 발생 0건 (regressed 아님)
- Warning 감소 또는 동일

위 조건 충족 시 `VERDICT: PASS`. 미충족 시 다음 루프 또는 ESCALATE.

## 제약

- 임계값 완화로 Critical 회피 금지 (regressed 판정됨)
- 지시서 범위 밖 리팩토링 금지 (이번 루프는 Critical 해결만)
- 다른 Phase 파일 수정 시 `requires_cross_phase: true`를 사전 알림
```

## 작성 시 주의

1. **implementer별 그룹화.** 동일 구현 스킬이 담당하는 finding을 묶어 1회 호출로 처리.
2. **해결 조건 명시.** "수정하세요" 수준이 아니라 "무엇을 만족해야 resolved 판정인지" 구체적으로.
3. **manual 분리.** 자동 구현 불가 항목은 별도 섹션으로 사용자에게 가시화.
4. **재진입 인자 명확.** 구현 스킬이 수정 완료 후 하네스를 재호출할 수 있도록 `phase`, `type`, `prev_report`, `loop_count` 명시.
5. **범위 제한.** 지시서에 포함되지 않은 리팩토링 금지 — 루프 범위를 좁게 유지.
