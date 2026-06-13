import { Bot } from 'grammy';
import { getAllUsers, getWeeklyStats, getBriefingItems } from '../db';
import { weeklyDigest, weeklyBriefing } from '../copy';

export async function runWeeklyDigest(bot: Bot) {
  const users = await getAllUsers();

  for (const user of users) {
    if (user.mode === 'paused') continue;

    try {
      // 1. 아이템 브리핑
      const items = await getBriefingItems(user.id);
      const briefing = weeklyBriefing(items);
      await bot.api.sendMessage(user.tg_chat_id, briefing);

      // 2. 주간 정산 (숫자 요약)
      const stats = await getWeeklyStats(user.id);
      const digest = weeklyDigest(
        stats.dumps,
        stats.done,
        stats.archived,
        stats.dropped,
        stats.pendingDecisions,
      );
      await bot.api.sendMessage(user.tg_chat_id, digest);
    } catch (err) {
      console.error(`Weekly digest error for user ${user.id}:`, err);
    }
  }
}
