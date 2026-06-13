# DAMA Bot

ADHD 텔레그램 봇. 비정형 텍스트 → AI 분류 → 단일 행동 카드 리서페이싱.

작업 전 반드시 `ARCHITECTURE.md`를 읽고 전체 플로우와 파일별 역할을 파악할 것.

## Tech Stack

- **Runtime**: Node.js + TypeScript (CommonJS, moduleResolution: node10)
- **Bot Framework**: grammY (long polling)
- **DB**: Supabase (Postgres, service role key, RLS 미사용)
- **LLM**: Anthropic claude-haiku-4-5-20251001 (분류 + split 2곳만)
- **Cron**: node-cron (sweep 60s, morning hourly, weekly Sun 20:00 KST)

## Key Design Decisions

- LLM 호출은 classify + splitAction 딱 2곳. 카드 선택은 deterministic.
- 단일 카드 강제: 유저당 active 카드 1개만.
- Scheduled는 deadline(due_at) / timed(action_time) 이원화. ping_at 자동 계산.
- Emotion은 archived 처리, 카드에 노출 안 함.
- Someday는 주간 브리핑에서 일괄 리뷰 (resurface 미사용).
- 모든 시각은 Asia/Seoul 기준. periodOf() 함수로 시간대 텍스트 변환.
- 응답 톤: 반말, 최대 3문장, 부정 프레이밍 금지.

## Env Vars

- `BOT_TOKEN` — Telegram bot token
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SECRET_KEY` — Supabase service role (secret) key
- `ANTHROPIC_API_KEY` — Anthropic API key
- `ALLOWED_TG_USER_ID` — Whitelist (comma-separated Telegram user IDs)
