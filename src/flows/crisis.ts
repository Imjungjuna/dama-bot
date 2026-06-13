import { Context } from 'grammy';
import {
  countRecentElevated,
  logEvent,
  setUserMode,
} from '../db';
import {
  EMOTION_RESPONSE,
  ELEVATED_RESPONSE,
  CRISIS_RESPONSE,
} from '../copy';

export async function handleCrisis(
  ctx: Context,
  userId: string,
  level: 'elevated' | 'crisis',
) {
  if (level === 'crisis') {
    await logEvent(userId, 'crisis_flag', null);
    await setUserMode(userId, 'paused', 48);
    await ctx.reply(CRISIS_RESPONSE);
    return;
  }

  // elevated: check 72h accumulation
  const recentCount = await countRecentElevated(userId);

  if (recentCount >= 3) {
    await logEvent(userId, 'soft_mode_on', null);
    await setUserMode(userId, 'soft', 24);
    await ctx.reply(ELEVATED_RESPONSE);
  }
  // Individual elevated dumps still get processed normally
  // (the dump handler continues after this function returns)
}
