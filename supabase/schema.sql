-- dama-bot v1 schema
-- Run this in Supabase SQL Editor

-- ── Enum types ──

create type user_mode as enum ('normal', 'soft', 'paused');
create type dump_source as enum ('text', 'voice');
create type severity_level as enum ('none', 'elevated', 'crisis');
create type item_type as enum ('action', 'scheduled', 'decision', 'someday', 'emotion', 'memory');
create type item_status as enum ('inbox', 'active', 'snoozed', 'done', 'dropped', 'archived');
create type ping_kind as enum ('timer_check', 'morning_card', 'someday_check', 'weekly_digest', 'no_response_check', 'scheduled_reminder');
create type ping_status as enum ('pending', 'sent', 'cancelled');
create type event_kind as enum (
  'dump_received', 'card_sent', 'card_start', 'card_later',
  'card_split', 'card_drop', 'ping_done', 'ping_more',
  'ping_drift', 'ping_no_response', 'someday_kept',
  'someday_dropped', 'done_report_matched', 'crisis_flag',
  'soft_mode_on', 'llm_parse_fail'
);

-- ── Tables ──

create table users (
  id uuid primary key default gen_random_uuid(),
  tg_user_id bigint unique not null,
  tg_chat_id bigint not null,
  tz text not null default 'Asia/Seoul',
  morning_hour int not null default 9,
  mode user_mode not null default 'normal',
  mode_until timestamptz,
  created_at timestamptz not null default now()
);

create table dumps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  raw_text text not null,
  source dump_source not null default 'text',
  severity severity_level not null default 'none',
  created_at timestamptz not null default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  dump_id uuid references dumps(id),
  type item_type not null,
  title text not null,
  first_action text,
  est_minutes int not null default 25,
  status item_status not null default 'inbox',
  due_at timestamptz,
  action_time timestamptz,
  ping_at timestamptz,
  resurface_at timestamptz,
  options text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table events (
  id bigint generated always as identity primary key,
  user_id uuid not null references users(id),
  item_id uuid references items(id),
  kind event_kind not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table pings (
  id bigint generated always as identity primary key,
  user_id uuid not null references users(id),
  item_id uuid references items(id),
  kind ping_kind not null,
  due_at timestamptz not null,
  status ping_status not null default 'pending',
  meta jsonb not null default '{}'
);

create index on items (user_id, status, due_at);
create index on pings (status, due_at);
create index on events (user_id, created_at);
