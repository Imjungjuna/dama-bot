# DAMA Bot

AI-powered Telegram bot for ADHD task management. Classifies unstructured text dumps into actionable single-focus cards with smart scheduling, crisis detection, and weekly reviews.

## How It Works

1. **Dump** — Send any unstructured text to the bot
2. **Classify** — AI categorizes it (action, scheduled, decision, someday, emotion, memory)
3. **Card** — Bot surfaces one card at a time to keep focus
4. **Track** — Inline buttons to start, snooze, split, complete, or drop tasks

```
User: "내일 오후 3시 미팅 있어"
Bot:  📌 미팅 참석 — 내일 오후 2시(1시간 전)에 알려줄게.
```

## Features

- **Single-card focus** — Only one active card per user at a time
- **Smart scheduling** — Automatic ping calculation for deadlines and timed events
- **Crisis detection** — Monitors emotional severity; enters paused/soft mode when needed
- **Task splitting** — AI-powered task decomposition via inline button
- **Done reporting** — Natural language task completion matching
- **Morning cards** — Daily card delivery at user's preferred hour
- **Weekly digest** — Sunday briefing with stats and someday item review

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js + TypeScript |
| Bot Framework | [grammY](https://grammy.dev/) (long polling) |
| Database | [Supabase](https://supabase.com/) (PostgreSQL) |
| LLM | [Anthropic Claude](https://www.anthropic.com/) (claude-haiku-4-5) |
| Scheduler | node-cron |

## Project Structure

```
src/
├── index.ts              # Entry point, message routing, cron setup
├── card.ts               # Card selection logic & formatting
├── copy.ts               # All bot response text templates
├── db.ts                 # Supabase CRUD operations
├── llm.ts                # Anthropic SDK wrapper
├── pipeline/
│   ├── classify.ts       # LLM classification (severity/intent/type)
│   ├── router.ts         # Dump → item conversion, ping scheduling
│   └── split.ts          # LLM-based task decomposition
├── flows/
│   ├── dump.ts           # Main message dispatcher
│   ├── buttons.ts        # Inline button callback handlers
│   └── crisis.ts         # Crisis detection protocol
└── jobs/
    ├── sweep.ts           # 60s ping sweep
    ├── morning.ts         # Hourly morning card check
    └── weekly.ts          # Weekly digest (Sun 20:00 KST)
supabase/
└── schema.sql            # Database schema with enums
web/                      # Dashboard (Next.js)
```

## Setup

### Prerequisites

- Node.js 20+
- Supabase project
- Telegram bot token (via [@BotFather](https://t.me/BotFather))
- Anthropic API key

### Environment Variables

```env
BOT_TOKEN=your_telegram_bot_token
SUPABASE_URL=your_supabase_project_url
SUPABASE_SECRET_KEY=your_supabase_service_role_key
ANTHROPIC_API_KEY=your_anthropic_api_key
ALLOWED_TG_USER_ID=comma_separated_telegram_user_ids
```

### Installation

```bash
# Install dependencies
npm install

# Run database schema
# Execute supabase/schema.sql in your Supabase SQL Editor

# Start development server
npm run dev

# Build & run production
npm run build
npm start
```

## Classification System

| Type | Description | Card eligible |
|------|-------------|---------------|
| `action` | Concrete, startable task | Yes |
| `scheduled` | Time-bound task (deadline or timed) | Yes (at ping time) |
| `decision` | Pending decision | Yes |
| `someday` | Vague / low commitment | No (weekly review) |
| `emotion` | Emotional expression | No (archived) |
| `memory` | Information to remember | Yes (weekly review) |

## Cron Jobs

| Interval | Job | Description |
|----------|-----|-------------|
| Every 60s | Sweep | Polls `pings` table, sends due pings |
| Every hour | Morning cards | Sends card if current hour matches user's `morning_hour` |
| Sun 20:00 KST | Weekly digest | Briefing + stats + someday review |

## License

ISC
