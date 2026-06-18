import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SECRET_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ── Users ──

export async function getOrCreateUser(tgUserId: number, tgChatId: number) {
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('tg_user_id', tgUserId)
    .single();

  if (existing) return existing;

  const { data, error } = await supabase
    .from('users')
    .insert({ tg_user_id: tgUserId, tg_chat_id: tgChatId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getUser(tgUserId: number) {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('tg_user_id', tgUserId)
    .single();
  return data;
}

export async function getUserById(userId: string) {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  return data;
}

export async function updateUser(userId: string, fields: Record<string, unknown>) {
  const { error } = await supabase
    .from('users')
    .update(fields)
    .eq('id', userId);
  if (error) throw error;
}

export async function setMorningHour(userId: string, hour: number) {
  await updateUser(userId, { morning_hour: hour });
}

export async function setUserMode(userId: string, mode: string, hours: number) {
  const modeUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  await updateUser(userId, { mode, mode_until: modeUntil });
}

// ── Dumps ──

export async function createDump(userId: string, rawText: string, severity: string) {
  const { data, error } = await supabase
    .from('dumps')
    .insert({ user_id: userId, raw_text: rawText, severity })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Items ──

export async function createItem(fields: {
  user_id: string;
  dump_id: string;
  type: string;
  title: string;
  first_action?: string | null;
  est_minutes?: number;
  status?: string;
  due_at?: string | null;
  action_time?: string | null;
  ping_at?: string | null;
  resurface_at?: string | null;
  options?: string[] | null;
  comment?: string | null;
}) {
  const { data, error } = await supabase
    .from('items')
    .insert(fields)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateItem(itemId: string, fields: Record<string, unknown>) {
  const { error } = await supabase
    .from('items')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', itemId);
  if (error) throw error;
}

export async function getActiveCard(userId: string) {
  // Card that was sent but not yet responded to (active or inbox with a card_sent event but no response)
  const { data } = await supabase
    .from('items')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

export async function pickNextCard(userId: string) {
  const now = new Date().toISOString();

  // Priority 1: overdue or due today scheduled/memory (deadline: due_at, timed: action_time)
  const { data: deadlined } = await supabase
    .from('items')
    .select('*')
    .eq('user_id', userId)
    .in('type', ['scheduled', 'memory'])
    .in('status', ['inbox', 'snoozed'])
    .not('due_at', 'is', null)
    .lte('due_at', now)
    .order('due_at', { ascending: true })
    .limit(1)
    .single();

  if (deadlined) return deadlined;

  const { data: timed } = await supabase
    .from('items')
    .select('*')
    .eq('user_id', userId)
    .in('type', ['scheduled', 'memory'])
    .in('status', ['inbox', 'snoozed'])
    .not('action_time', 'is', null)
    .lte('action_time', now)
    .order('action_time', { ascending: true })
    .limit(1)
    .single();

  if (timed) return timed;

  // Priority 2: oldest inbox/active action, smallest est_minutes as tiebreak
  const { data: action } = await supabase
    .from('items')
    .select('*')
    .eq('user_id', userId)
    .eq('type', 'action')
    .in('status', ['inbox', 'snoozed'])
    .order('created_at', { ascending: true })
    .order('est_minutes', { ascending: true })
    .limit(1)
    .single();

  return action;
}

export async function findOpenItemByKeyword(userId: string, keyword: string) {
  const { data } = await supabase
    .from('items')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['inbox', 'active', 'snoozed'])
    .ilike('title', `%${keyword}%`)
    .limit(1)
    .single();
  return data;
}

// ── Events ──

export async function logEvent(
  userId: string,
  kind: string,
  itemId?: string | null,
  payload: Record<string, unknown> = {},
) {
  await supabase.from('events').insert({
    user_id: userId,
    item_id: itemId ?? null,
    kind,
    payload,
  });
}

export async function countRecentElevated(userId: string, hoursBack = 72) {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', 'dump_received')
    .gte('created_at', since)
    .eq('payload->>severity', 'elevated');
  return count ?? 0;
}

// ── Pings ──

export async function schedulePing(
  userId: string,
  itemId: string | null,
  kind: string,
  dueAt: Date,
  meta: Record<string, unknown> = {},
) {
  await supabase.from('pings').insert({
    user_id: userId,
    item_id: itemId,
    kind,
    due_at: dueAt.toISOString(),
    meta,
  });
}

export async function getDuePings() {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('pings')
    .select('*')
    .eq('status', 'pending')
    .lte('due_at', now)
    .order('due_at', { ascending: true });
  return data ?? [];
}

export async function markPingSent(pingId: number) {
  await supabase
    .from('pings')
    .update({ status: 'sent' })
    .eq('id', pingId);
}

export async function cancelPingsForItem(itemId: string) {
  await supabase
    .from('pings')
    .update({ status: 'cancelled' })
    .eq('item_id', itemId)
    .eq('status', 'pending');
}

// ── Weekly stats ──

export async function getWeeklyStats(userId: string) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { count: dumpCount } = await supabase
    .from('dumps')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', weekAgo)
    .neq('severity', 'crisis');

  const { count: doneCount } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'done')
    .gte('updated_at', weekAgo)
    .neq('type', 'emotion');

  const { count: archivedCount } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'archived')
    .gte('updated_at', weekAgo)
    .neq('type', 'emotion');

  const { count: droppedCount } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'dropped')
    .gte('updated_at', weekAgo)
    .neq('type', 'emotion');

  const { count: pendingDecisions } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', 'decision')
    .in('status', ['inbox', 'snoozed']);

  return {
    dumps: dumpCount ?? 0,
    done: doneCount ?? 0,
    archived: archivedCount ?? 0,
    dropped: droppedCount ?? 0,
    pendingDecisions: pendingDecisions ?? 0,
  };
}

// ── 주간 브리핑용 아이템 조회 ──

export async function getBriefingItems(userId: string) {
  const { data: actions } = await supabase
    .from('items')
    .select('title')
    .eq('user_id', userId)
    .eq('type', 'action')
    .in('status', ['inbox', 'snoozed'])
    .order('created_at', { ascending: true })
    .limit(10);

  const { data: decisions } = await supabase
    .from('items')
    .select('title, options')
    .eq('user_id', userId)
    .eq('type', 'decision')
    .in('status', ['inbox', 'snoozed'])
    .order('created_at', { ascending: true })
    .limit(10);

  const { data: somedays } = await supabase
    .from('items')
    .select('title')
    .eq('user_id', userId)
    .eq('type', 'someday')
    .eq('status', 'archived')
    .order('created_at', { ascending: true })
    .limit(10);

  const { data: memories } = await supabase
    .from('items')
    .select('title')
    .eq('user_id', userId)
    .eq('type', 'memory')
    .in('status', ['inbox', 'snoozed'])
    .order('created_at', { ascending: true })
    .limit(10);

  return {
    actions: actions ?? [],
    decisions: decisions ?? [],
    somedays: somedays ?? [],
    memories: memories ?? [],
  };
}

// ── All users (for cron jobs) ──

export async function getAllUsers() {
  const { data } = await supabase.from('users').select('*');
  return data ?? [];
}
