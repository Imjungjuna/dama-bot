import { Bot } from 'grammy';
import { getAllUsers, logEvent } from '../db';
import { sendCard } from '../card';

export async function runMorningCards(bot: Bot) {
  const users = await getAllUsers();
  const now = new Date();
  const currentHour = parseInt(
    now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false }),
  );

  for (const user of users) {
    // Only send at user's configured morning_hour
    if (user.morning_hour !== currentHour) continue;

    // Skip if paused or soft mode
    if (user.mode === 'paused' || user.mode === 'soft') {
      // Check if mode_until expired → auto-reset
      if (user.mode_until && new Date(user.mode_until) <= now) {
        const { updateUser } = await import('../db');
        await updateUser(user.id, { mode: 'normal', mode_until: null });
      } else {
        continue;
      }
    }

    try {
      await sendCard(user.id, async (text, kb) => {
        await bot.api.sendMessage(user.tg_chat_id, text, kb ? { reply_markup: kb } : undefined);
      });
    } catch (err) {
      console.error(`Morning card error for user ${user.id}:`, err);
    }
  }
}
