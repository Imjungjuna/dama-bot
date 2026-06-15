import { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import {
  getDuePings,
  markPingSent,
  updateItem,
  logEvent,
  getUserById,
  schedulePing,
  supabase,
} from '../db';
import { TIMER_CHECK } from '../copy';
import { sendCard } from '../card';

export async function runSweep(bot: Bot) {
  const pings = await getDuePings();

  for (const ping of pings) {
    try {
      const user = await getUserById(ping.user_id);
      if (!user) continue;

      // Respect mode: skip pings if paused or soft
      if (user.mode === 'paused') {
        await markPingSent(ping.id);
        continue;
      }

      // soft mode: timer_check와 scheduled_reminder는 허용
      if (user.mode === 'soft' && ping.kind !== 'timer_check' && ping.kind !== 'scheduled_reminder') {
        await markPingSent(ping.id);
        continue;
      }

      // Check if mode_until has expired → reset to normal
      if (user.mode !== 'normal' && user.mode_until) {
        if (new Date(user.mode_until) <= new Date()) {
          const { updateUser } = await import('../db');
          await updateUser(user.id, { mode: 'normal', mode_until: null });
        }
      }

      switch (ping.kind) {
        case 'timer_check':
          await sendTimerCheck(bot, user, ping);
          break;
        case 'scheduled_reminder':
          await sendScheduledReminder(bot, user, ping);
          break;
        // morning_card and weekly_digest handled by their own cron jobs
      }

      await markPingSent(ping.id);
    } catch (err) {
      console.error(`Sweep error for ping ${ping.id}:`, err);
    }
  }
}

async function sendTimerCheck(bot: Bot, user: any, ping: any) {
  const kb = new InlineKeyboard()
    .text('완료', `done:${ping.item_id}`)
    .text('더 필요', `more:${ping.item_id}`)
    .text('딴 데 샜어', `drift:${ping.item_id}`);

  await bot.api.sendMessage(user.tg_chat_id, TIMER_CHECK, {
    reply_markup: kb,
  });

  // Schedule no-response check: 30min later
  const noResponseAt = new Date(Date.now() + 30 * 60 * 1000);
  await schedulePing(user.id, ping.item_id, 'no_response_check', noResponseAt);
}

async function sendScheduledReminder(bot: Bot, user: any, ping: any) {
  if (!ping.item_id) return;

  const { data: item } = await supabase
    .from('items')
    .select('id, title, action_time, due_at')
    .eq('id', ping.item_id)
    .single();

  if (!item) return;

  const target = item.action_time ?? item.due_at;
  const timeLabel = target ? formatReminderTime(new Date(target)) : '';
  const text = `⏰ ${item.title}${timeLabel ? ` — ${timeLabel}` : ''}`;

  const kb = new InlineKeyboard()
    .text('시작', `start:${item.id}`)
    .text('나중에', `later:${item.id}`);

  await bot.api.sendMessage(user.tg_chat_id, text, { reply_markup: kb });
  await logEvent(user.id, 'scheduled_reminder_sent', item.id);
}

function formatReminderTime(target: Date): string {
  const now = new Date();
  const diffMin = Math.round((target.getTime() - now.getTime()) / 60000);

  if (diffMin <= 0) return '지금!';
  if (diffMin < 60) return `${diffMin}분 뒤`;
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return mins > 0 ? `${hours}시간 ${mins}분 뒤` : `${hours}시간 뒤`;
}

