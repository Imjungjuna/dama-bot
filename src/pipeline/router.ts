import { ClassifyResult } from './classify';
import { createDump, createItem, logEvent, schedulePing } from '../db';

export interface RouteResult {
  dump: { id: string };
  item: { id: string; type: string; title: string; status: string } | null;
  pingAt: string | null;
  pingWarning: string | null;
}

export async function routeDump(
  userId: string,
  rawText: string,
  c: ClassifyResult,
): Promise<RouteResult> {
  const dump = await createDump(userId, rawText, c.severity);

  await logEvent(userId, 'dump_received', null, { severity: c.severity, type: c.type });

  if (!c.type || !c.title) {
    return { dump, item: null, pingAt: null, pingWarning: null };
  }

  // HARD GUARD: emotion → action conversion blocked
  const type = c.type;
  const status = resolveStatus(type);
  // someday는 주간 브리핑에서 일괄 리뷰 (resurface 미사용)

  // ── scheduled: schedule_kind 폴백 + ping_at 계산 ──
  // LLM이 schedule_kind 안 채웠을 때 due_at/action_time 존재 여부로 추론
  if (type === 'scheduled' && !c.schedule_kind) {
    if (c.action_time) {
      c.schedule_kind = 'timed';
    } else if (c.due_at) {
      c.schedule_kind = 'deadline';
    }
  }

  const { pingAt, pingWarning } = type === 'scheduled'
    ? computePingAt(c)
    : { pingAt: null, pingWarning: null };

  const resolvedDueAt = c.schedule_kind === 'deadline' ? c.due_at ?? null : null;
  const resolvedActionTime = c.schedule_kind === 'timed' ? c.action_time ?? null : null;
  // 폴백: schedule_kind 없고 due_at만 있으면 due_at 그대로 저장
  const fallbackDueAt = !c.schedule_kind && c.due_at ? c.due_at : null;

  const item = await createItem({
    user_id: userId,
    dump_id: dump.id,
    type,
    title: c.title,
    first_action: type === 'action' ? c.first_action : null,
    est_minutes: c.est_minutes ?? 25,
    status,
    due_at: resolvedDueAt ?? fallbackDueAt,
    action_time: resolvedActionTime,
    ping_at: pingAt,
    resurface_at: null,
    options: type === 'decision' && c.options ? c.options : null,
    comment: type === 'scheduled' ? c.comment : null,
  });

  // scheduled → ping 예약 (pingAt이 있을 때만)
  if (type === 'scheduled' && pingAt) {
    await schedulePing(userId, item.id, 'scheduled_reminder', new Date(pingAt));
  }

  return { dump, item, pingAt, pingWarning };
}

function computePingAt(c: ClassifyResult): { pingAt: string | null; pingWarning: string | null } {
  const now = Date.now();
  const target = c.schedule_kind === 'deadline'
    ? c.due_at
    : c.action_time;

  if (!target) return { pingAt: null, pingWarning: null };

  const targetMs = new Date(target).getTime();

  // 유저가 알림 시간을 명시한 경우
  if (c.remind_at_explicit) {
    const explicitMs = new Date(c.remind_at_explicit).getTime();

    if (explicitMs <= now) {
      // 과거 알림 → 테스크는 저장하되 경고
      return {
        pingAt: null,
        pingWarning: '과거로 가서 알려줄 수는 없어. 일단 무슨 말인지는 알겠어, 태스크에 추가해둘게.',
      };
    }

    if (explicitMs >= targetMs) {
      // 기한/시점 이후 알림 → 의미 없음
      return {
        pingAt: null,
        pingWarning: '기한이 지난 시점에 알려주는 건 의미가 없을 것 같은데, 일단 태스크에 추가만 해둘게.',
      };
    }

    return { pingAt: new Date(explicitMs).toISOString(), pingWarning: null };
  }

  // 자동 계산
  const diffMs = targetMs - now;
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const ONE_HOUR = 60 * 60 * 1000;
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  let pingMs: number;
  if (diffMs > TWENTY_FOUR_HOURS) {
    pingMs = targetMs - SIX_HOURS;
  } else {
    pingMs = targetMs - ONE_HOUR;
  }

  // 과거 보정: ping이 이미 지났으면 즉시
  if (pingMs <= now) {
    pingMs = now;
  }

  return { pingAt: new Date(pingMs).toISOString(), pingWarning: null };
}

function resolveStatus(type: string): string {
  switch (type) {
    case 'emotion':
    case 'someday':
      return 'archived';
    default:
      return 'inbox';
  }
}
