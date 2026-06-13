import 'dotenv/config';
import { Bot, InlineKeyboard } from 'grammy';
import cron from 'node-cron';
import { getOrCreateUser, getUser, updateUser } from './db';
import { handleDump } from './flows/dump';
import { registerButtonHandlers } from './flows/buttons';
import { sendCard } from './card';
import { runSweep } from './jobs/sweep';
import { runMorningCards } from './jobs/morning';
import { runWeeklyDigest } from './jobs/weekly';
import {
  ONBOARDING,
  VOICE_NOT_SUPPORTED,
  PAUSED,
  RESUMED,
} from './copy';

// ── Validate env ──
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_USER = process.env.ALLOWED_TG_USER_ID;
if (!TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is unset');
if (!ALLOWED_USER) throw new Error('ALLOWED_TG_USER_ID is unset — Telegram에서 @userinfobot 에게 메시지 보내면 본인 user id 확인 가능');

const allowedUserId = Number(ALLOWED_USER);
const bot = new Bot(TOKEN);

// ── Whitelist guard ──
bot.use(async (ctx, next) => {
  const tgUserId = ctx.from?.id;
  if (!tgUserId || tgUserId !== allowedUserId) return; // silent ignore

  // Attach user to context for downstream handlers
  const user = await getOrCreateUser(tgUserId, ctx.chat?.id ?? tgUserId);
  (ctx as any).__userId = user.id;

  await next();
});

// ── /start — Onboarding ──
bot.command('start', async (ctx) => {
  await ctx.reply(ONBOARDING[0]);
  await ctx.reply(ONBOARDING[1]);

  const kb = new InlineKeyboard()
    .text('8시', 'morning:8')
    .text('9시', 'morning:9')
    .text('10시', 'morning:10');
  await ctx.reply(ONBOARDING[2], { reply_markup: kb });
});

// ── /now — Card shortcut ──
bot.command('now', async (ctx) => {
  const userId = (ctx as any).__userId as string;
  await sendCard(userId, async (text, kb) => {
    await ctx.reply(text, kb ? { reply_markup: kb } : undefined);
  });
});

// ── /week — Weekly briefing + digest on demand ──
bot.command('week', async (ctx) => {
  const userId = (ctx as any).__userId as string;
  const { getWeeklyStats, getBriefingItems } = await import('./db');
  const { weeklyDigest, weeklyBriefing } = await import('./copy');

  // 1. 브리핑
  const items = await getBriefingItems(userId);
  await ctx.reply(weeklyBriefing(items));

  // 2. 정산
  const stats = await getWeeklyStats(userId);
  await ctx.reply(weeklyDigest(stats.dumps, stats.done, stats.archived, stats.dropped, stats.pendingDecisions));
});

// ── /pause & /resume ──
bot.command('pause', async (ctx) => {
  const userId = (ctx as any).__userId as string;
  await updateUser(userId, { mode: 'paused', mode_until: null });
  await ctx.reply(PAUSED);
});

bot.command('resume', async (ctx) => {
  const userId = (ctx as any).__userId as string;
  await updateUser(userId, { mode: 'normal', mode_until: null });
  await ctx.reply(RESUMED);
});

// ── Voice message ──
bot.on('message:voice', async (ctx) => {
  await ctx.reply(VOICE_NOT_SUPPORTED);
});

// ── Regex pre-filter for card requests ──
const CARD_REGEX = /^(뭐하지|뭐할까|카드)$/;
const WEEK_REGEX = /주간.*(정산|브리핑|리뷰)|정산.*해줘|브리핑.*해줘/;

// ── Text messages ──
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  const userId = (ctx as any).__userId as string;

  // Card request via regex (skip LLM)
  if (CARD_REGEX.test(text)) {
    await sendCard(userId, async (t, kb) => {
      await ctx.reply(t, kb ? { reply_markup: kb } : undefined);
    });
    return;
  }

  // Weekly briefing via regex (skip LLM)
  if (WEEK_REGEX.test(text)) {
    const { getWeeklyStats, getBriefingItems } = await import('./db');
    const { weeklyDigest, weeklyBriefing } = await import('./copy');
    const items = await getBriefingItems(userId);
    await ctx.reply(weeklyBriefing(items));
    const stats = await getWeeklyStats(userId);
    await ctx.reply(weeklyDigest(stats.dumps, stats.done, stats.archived, stats.dropped, stats.pendingDecisions));
    return;
  }

  // All other text → dump pipeline
  await handleDump(ctx, userId);
});

// ── Register button callbacks ──
registerButtonHandlers(bot);

// ── Cron jobs ──

// Ping sweep: every 60 seconds
cron.schedule('* * * * *', () => {
  runSweep(bot).catch((err) => console.error('Sweep error:', err));
});

// Morning card: check every hour (individual user hours handled in job)
cron.schedule('0 * * * *', () => {
  runMorningCards(bot).catch((err) => console.error('Morning card error:', err));
});

// Weekly briefing + digest: Sunday 20:00 KST
cron.schedule('0 11 * * 0', () => {
  // 11:00 UTC = 20:00 KST
  runWeeklyDigest(bot).catch((err) => console.error('Weekly digest error:', err));
});

// ── Error handler — 에러를 콘솔에 출력 ──
bot.catch((err) => {
  console.error('Bot error:', err);
});

// ── Graceful shutdown ──
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());

// ── Start ──
console.log('Bot starting...');
bot.start();
