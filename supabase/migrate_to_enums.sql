-- Migration: text columns → enum types
-- Run this in Supabase SQL Editor if tables already exist

-- 1. Create enum types
create type user_mode as enum ('normal', 'soft', 'paused');
create type dump_source as enum ('text', 'voice');
create type risk_level as enum ('none', 'elevated', 'crisis');
create type item_type as enum ('action', 'scheduled', 'decision', 'someday', 'emotion', 'memory');
create type item_status as enum ('inbox', 'active', 'snoozed', 'done', 'dropped', 'archived');
create type ping_kind as enum ('timer_check', 'morning_card', 'someday_check', 'weekly_digest', 'no_response_check');
create type ping_status as enum ('pending', 'sent', 'cancelled');
create type event_kind as enum (
  'dump_received', 'card_sent', 'card_start', 'card_later',
  'card_split', 'card_drop', 'ping_done', 'ping_more',
  'ping_drift', 'ping_no_response', 'someday_kept',
  'someday_dropped', 'done_report_matched', 'crisis_flag',
  'soft_mode_on', 'llm_parse_fail'
);

-- 2. Drop defaults → alter type → restore defaults

-- users.mode
alter table users alter column mode drop default;
alter table users alter column mode type user_mode using mode::user_mode;
alter table users alter column mode set default 'normal';

-- dumps.source
alter table dumps alter column source drop default;
alter table dumps alter column source type dump_source using source::dump_source;
alter table dumps alter column source set default 'text';

-- dumps.risk
alter table dumps alter column risk drop default;
alter table dumps alter column risk type risk_level using risk::risk_level;
alter table dumps alter column risk set default 'none';

-- items.type
alter table items alter column type type item_type using type::item_type;

-- items.status
alter table items alter column status drop default;
alter table items alter column status type item_status using status::item_status;
alter table items alter column status set default 'inbox';

-- events.kind
alter table events alter column kind type event_kind using kind::event_kind;

-- pings.kind
alter table pings alter column kind type ping_kind using kind::ping_kind;

-- pings.status
alter table pings alter column status drop default;
alter table pings alter column status type ping_status using status::ping_status;
alter table pings alter column status set default 'pending';
