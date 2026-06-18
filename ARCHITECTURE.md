# DAMA Bot Architecture

ADHD 사용자의 비정형 텍스트를 분류·저장·리서페이싱하는 텔레그램 봇.

---

## 전체 입력 처리 플로우

```
User sends text message
    │
    ├─ index.ts: Regex pre-filter
    │   ├─ 카드/뭐하지/뭐할까 → sendCard() [LLM 스킵]
    │   ├─ 주간 정산/브리핑 → getBriefingItems + getWeeklyStats [LLM 스킵]
    │   └─ Default → handleDump(ctx, userId)
    │
    ├─ classify(text, userId) — LLM 분류
    │   └─ severity → intent → type → title → schedule_kind → due_at/action_time
    │
    ├─ Severity 라우팅
    │   ├─ crisis → handleCrisis() → 48h paused mode → STOP
    │   └─ elevated → 72h 누적 3회 이상 시 soft mode 24h → CONTINUE
    │
    ├─ Intent 라우팅
    │   ├─ ask_card (type=null) → sendCard()
    │   ├─ done_report → findOpenItemByKeyword → 확인 버튼
    │   └─ dump → routeDump()
    │
    └─ routeDump(userId, rawText, result)
        ├─ createDump() → dumps 테이블
        ├─ schedule_kind 폴백 (LLM 미반환 시 due_at/action_time으로 추론)
        ├─ computePingAt() → ping 시각 계산
        ├─ createItem() → items 테이블
        ├─ schedulePing() → pings 테이블 (scheduled만)
        └─ Ack 응답
            ├─ emotion → EMOTION_RESPONSE
            ├─ scheduled + pingAt → formatScheduledAck()
            └─ 기타 → ackForType()
```

---

## Scheduled 처리 플로우 (상세)

```
입력: "내일 오후 3시 미팅"
    │
    ├─ classify() → type:'scheduled', schedule_kind:'timed', action_time:'...', comment:'화이팅!'
    │
    ├─ routeDump() → computePingAt()
    │   ├─ remind_at_explicit 있으면 → 해당 시각 (과거/기한후 검증)
    │   └─ 자동 계산
    │       ├─ target > 24h → ping = target - 6h
    │       └─ target ≤ 24h → ping = target - 1h
    │       └─ ping ≤ now → ping = now (즉시)
    │
    ├─ createItem(action_time, ping_at, comment) → items 테이블 저장
    ├─ schedulePing(kind:'scheduled_reminder', due_at: pingAt)
    │
    ├─ Ack 응답
    │   ├─ formatScheduledAck(pingAt, target)
    │   │   ├─ periodOf(hour, min) → 새벽/아침/오전/정오/오후/저녁/밤
    │   │   ├─ 24h+ → "알겠어. 6/22(월) 저녁 6시(6시간 전)에 알려줄게."
    │   │   ├─ 당일 → "알겠어. 오후 1시(1시간 전)에 알려줄게."
    │   │   └─ 즉시 → "알겠어. 곧 알려줄게."
    │   └─ comment → "화이팅!" (별도 메시지)
    │
    └─ sweep (60s cron) → getDuePings() → sendScheduledReminder()
        ├─ "⏰ {title} — {남은시간}" + [시작][나중에] 버튼
        └─ comment 있으면 별도 메시지 전송
```

---

## 파일별 역할

| 파일 | 역할 |
|------|------|
| `src/index.ts` | 엔트리포인트. Telegram 메시지 라우팅, cron 등록, whitelist guard |
| `src/pipeline/classify.ts` | LLM 분류 (severity/intent/type/title/schedule) |
| `src/pipeline/router.ts` | 덤프→아이템 변환, pingAt 계산, DB 저장 |
| `src/pipeline/split.ts` | LLM 기반 태스크 분해 (더쪼개줘 버튼) |
| `src/flows/dump.ts` | 메시지 처리 메인 디스패처. severity→intent→type 라우팅 |
| `src/flows/buttons.ts` | 인라인 버튼 콜백 핸들러 (시작/나중에/쪼개기/버리기/완료 등) |
| `src/flows/crisis.ts` | 위기 감지 프로토콜. paused/soft 모드 전환 |
| `src/card.ts` | 카드 선택 로직 (단일 카드 강제), 포맷팅 |
| `src/copy.ts` | 모든 봇 응답 텍스트. weeklyBriefing, weeklyDigest 포함 |
| `src/db.ts` | Supabase CRUD. users/dumps/items/pings/events 테이블 |
| `src/llm.ts` | Anthropic SDK 래퍼. claude-haiku-4-5-20251001 |
| `src/jobs/sweep.ts` | 60초 ping sweep. timer_check, scheduled_reminder 처리 |
| `src/jobs/morning.ts` | 매시 정각 체크. user.morning_hour 매칭 시 카드 발송 |
| `src/jobs/weekly.ts` | 일요일 20:00 KST. 주간 브리핑 + 통계 |

---

## 분류 체계

| Type | 설명 | 초기 status | 카드 대상 |
|------|------|-------------|-----------|
| `action` | 구체적 시작 가능 태스크 | inbox | O |
| `scheduled` | 시점/기한 태스크 (deadline/timed) | inbox | O (ping 시) |
| `decision` | 미결정 고민 | inbox | O |
| `someday` | 불특정/의지 약함 | archived | X (주간 브리핑) |
| `emotion` | 감정 토로 | archived | X |
| `memory` | 기억 저장 | inbox | O (주간 브리핑) |

---

## 카드 우선순위 (pickNextCard)

1. 기한 도래 scheduled (due_at ≤ now)
2. 시점 도래 scheduled (action_time ≤ now)
3. 가장 오래된 action (est_minutes 작은 순 타이브레이크)

---

## Cron Jobs

| 주기 | 함수 | 동작 |
|------|------|------|
| 매 60초 | `runSweep()` | pings 테이블 폴링, 도래 ping 발송 |
| 매시 정각 | `runMorningCards()` | user.morning_hour 매칭 시 카드 |
| 일요일 20:00 KST | `runWeeklyDigest()` | 브리핑 + 통계 |

---

## 버튼 핸들러

| 버튼 | 동작 | status 변경 |
|------|------|-------------|
| 시작 | timer_check ping 예약 (+est_min) | → active |
| 나중에 | ping 취소, 내일 아침 리서페이스 | → snoozed |
| 더쪼개줘 | LLM split, first_action 갱신 | 유지 |
| 버려 | ping 취소 | → dropped |
| 완료 | ping 취소 | → done |
| +25분 | 추가 ping 예약 | 유지 |
| 딴짓함 | drift 확인 → resume/stop | 유지/→snoozed |

---

## 시간대 표현 (periodOf)

| 시각 | 표현 |
|------|------|
| 0:00~5:59 | 새벽 |
| 6:00~8:59 | 아침 |
| 9:00~11:59 | 오전 |
| 12:00 정각 | 정오 |
| 12:01~16:59 | 오후 |
| 17:00~19:59 | 저녁 |
| 20:00~23:59 | 밤 |
| 24:00 | 자정 |

경계값: 이전 구간 유지 (9시 정각 → 아침)

---

## User Mode

| 모드 | 트리거 | 지속 | ping 처리 |
|------|--------|------|-----------|
| normal | 기본 | - | 전부 발송 |
| paused | crisis 감지 | 48h | 전부 스킵 |
| soft | elevated 3회/72h | 24h | timer_check/scheduled_reminder만 허용 |
