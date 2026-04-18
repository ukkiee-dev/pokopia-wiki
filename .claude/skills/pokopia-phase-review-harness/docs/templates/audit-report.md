# 통합 감사 리포트 템플릿

`_workspace/audit/phase-{N}/{timestamp}/REPORT.md`의 구조. 리더가 이 템플릿을 채워 최종 리포트를 생성한다.

---

## Template

```markdown
# Phase {N} Audit Report — {type}

**VERDICT:** {PASS | LOOP_REQUIRED | ESCALATE}
**Timestamp:** {YYYY-MM-DD HH:MM}
**Loop:** {loop_count} / {MAX_RETRY}
**Duration:** {실행 시간}

## Summary

- **Critical:** {n}건
- **Warning:** {n}건
- **Info:** {n}건
- **감사 참여자:** {auditor list}
- **대상 아티팩트:** {artifacts count}개 파일

> {리더의 2-3문장 총평: 주요 이슈, 패턴, 권고}

## Verdict Detail

### PASS 시:
- "Critical 없음, Warning {n}건 기록됨"
- 다음 Phase 진행 권장

### LOOP_REQUIRED 시:
- "Critical {n}건 발견. 루프백 지시서: loopback_directive.md"
- 재호출할 구현 스킬: {suggested_implementer 리스트}
- 루프백 후 재감사 권장

### ESCALATE 시:
- "loop_count={loop_count}, MAX_RETRY={MAX_RETRY} 도달"
- 사용자 결정 필요. 상세: ESCALATION_LOG.md 참조

## Findings by Severity

### Critical ({n})

{각 finding마다:}
#### [C-{id}] {rule} — {file}:{line}

- **evidence:** {증거}
- **suggestion:** {제안}
- **confidence:** {high|medium|low}
- **reporter:** {auditor name}
- **prev_status:** {있다면, resolved/partial/unresolved/regressed}
- **cross-links:** {related_findings}

### Warning ({n})
{동일 포맷}

### Info ({n})
{집계만 표시, 본문엔 상위 3개 + "나머지 X건 생략"}

## Cross-Issues (교차 이슈)

{2명 이상이 동일 파일/라인 또는 동일 주제를 지적한 항목}

#### [X-{id}] {주제}

- 관련 finding: C-001 (security), C-004 (architecture)
- 양측 관점 병기 (상충 시 삭제 금지)

## Regression Tracking (재감사 시)

| prev_status | 개수 |
|---|---|
| resolved | {n} |
| partial | {n} |
| unresolved | {n} |
| regressed | {n} |

{regressed 항목은 별도 경고 블록으로 표시}

## Forced Downgrades (Warning 강등 이력, ESCALATE(b) 선택 시)

| Original Critical | Downgraded To | Reason | Timestamp |
|---|---|---|---|

## Audit Input

- **Phase:** {N}
- **Type:** {type}
- **Profile:** docs/profiles/{type}.md
- **Artifacts:** {artifacts list}
- **Plan refs:** {plan_refs list}
- **Previous report:** {prev_report path, 있다면}

## Auditor Outputs

| Auditor | YAML Path | Findings |
|---|---|---|
| {name} | `01_{auditor}_findings.yaml` | C{n}/W{n}/I{n} |
| ... | ... | ... |

## Next Actions

- {PASS} → 다음 Phase 진행
- {LOOP_REQUIRED} → 구현자({implementer}) 재호출 → 재감사
- {ESCALATE} → 사용자 결정 (docs/escalation.md 참조)
```

## 작성 시 주의

1. **VERDICT는 최상단.** 사용자가 스크롤하지 않아도 판정 즉시 확인 가능.
2. **Critical 우선.** Warning/Info는 접을 수 있게 구성 (markdown details 태그 권장).
3. **cross-links 강조.** 교차 이슈는 별도 섹션으로 분리하여 리더의 통합 가치를 드러낸다.
4. **regressed 강조.** 재감사에서 regressed는 경고 색 블록으로 표시 (markdown 인용구 또는 ⚠️).
5. **경로는 상대 경로.** `_workspace/` 이하는 상대로, 프로젝트 루트 파일은 절대 경로 금지.
