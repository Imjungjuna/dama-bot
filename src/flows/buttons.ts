import { Context, InlineKeyboard } from 'grammy';
import {
  updateItem,
  logEvent,
  schedulePing,
  cancelPingsForItem,
  getUser,
} from '../db';
import { splitAction } from '../pipeline/split';
import { sendCard } from '../card';
import {
  startResponse,
  LATER_RESPONSE,
  DROP_RESPONSE,
  randomCongrats,
  moreTimeResponse,
  DRIFT_RESPONSE,
  CRISIS_FALSE_ALARM,
  cardText,
} from '../copy';

// Helper to extract itemId from callback data like "start:uuid"
function parseCallback(data: string): { action: string; itemId: string } {
  const [action, ...rest] = data.split(':');
  return { action, itemId: rest.join(':') };
}

export function registerButtonHandlers(bot: any) {
  bot.on('callback_query:data', async (ctx: Context) => {
    const data = ctx.callbackQuery?.data;
    if (!data) return;
    await ctx.answerCallbackQuery();

    const userId = (ctx as any).__userId as string;
    if (!userId) return;

    const { action, itemId } = parseCallback(data);

    switch (action) {
      case 'start':
        await handleStart(ctx, userId, itemId);
        break;
      case 'later':
        await handleLater(ctx, userId, itemId);
        break;
      case 'split':
        await handleSplit(ctx, userId, itemId);
        break;
      case 'drop':
        await handleDrop(ctx, userId, itemId);
        break;
      case 'done':
        await handleDone(ctx, userId, itemId);
        break;
      case 'more':
        await handleMore(ctx, userId, itemId);
        break;
      case 'drift':
        await handleDrift(ctx, userId, itemId);
        break;
      case 'drift_resume':
        await handleDriftResume(ctx, userId, itemId);
        break;
      case 'drift_stop':
        await handleDriftStop(ctx, userId, itemId);
        break;
      case 'rest':
        await handleRest(ctx, userId, itemId);
        break;
      case 'continue':
        await handleContinue(ctx, userId, itemId);
        break;
      case 'done_confirm':
        await handleDoneConfirm(ctx, userId, itemId);
        break;
      case 'done_deny':
        await ctx.reply('알겠어, 그대로 둘게.');
        break;
      case 'morning':
        await handleMorningHour(ctx, userId, itemId);
        break;
      case 'crisis_false':
        await ctx.reply(CRISIS_FALSE_ALARM);
        break;
      // someday는 주간 브리핑에서 일괄 리뷰 (개별 버튼 미사용)
      case 'decisions_view':
        await showPendingDecisions(ctx, userId);
        break;
      default:
        break;
    }
  });
}

// ── Button handlers ──

async function handleStart(ctx: Context, userId: string, itemId: string) {
  const { data: item } = await (await import('../db')).supabase
    .from('items')
    .select('est_minutes')
    .eq('id', itemId)
    .single();

  const est = item?.est_minutes ?? 25;
  await updateItem(itemId, { status: 'active' });
  await logEvent(userId, 'card_start', itemId);

  // Schedule timer ping
  const dueAt = new Date(Date.now() + est * 60 * 1000);
  await schedulePing(userId, itemId, 'timer_check', dueAt, { extend_count: 0 });

  await ctx.reply(startResponse(est));
}

async function handleLater(ctx: Context, userId: string, itemId: string) {
  await updateItem(itemId, { status: 'snoozed' });
  await cancelPingsForItem(itemId);
  await logEvent(userId, 'card_later', itemId);
  await ctx.reply(LATER_RESPONSE);
}

async function handleSplit(ctx: Context, userId: string, itemId: string) {
  const { data: item } = await (await import('../db')).supabase
    .from('items')
    .select('title, first_action, est_minutes')
    .eq('id', itemId)
    .single();

  if (!item) return;

  const result = await splitAction(item.title, item.first_action ?? '시작하기');
  await updateItem(itemId, { first_action: result.first_action });
  await logEvent(userId, 'card_split', itemId);

  // Re-send card with new first_action
  const kb = new InlineKeyboard()
    .text('시작', `start:${itemId}`)
    .text('나중에', `later:${itemId}`)
    .row()
    .text('더 쪼개줘', `split:${itemId}`)
    .text('버려', `drop:${itemId}`);

  await ctx.reply(
    cardText(item.title, result.first_action, (item as any).est_minutes ?? 25),
    { reply_markup: kb },
  );
}

async function handleDrop(ctx: Context, userId: string, itemId: string) {
  await updateItem(itemId, { status: 'dropped' });
  await cancelPingsForItem(itemId);
  await logEvent(userId, 'card_drop', itemId);
  await ctx.reply(DROP_RESPONSE);
}

async function handleDone(ctx: Context, userId: string, itemId: string) {
  await updateItem(itemId, { status: 'done' });
  await cancelPingsForItem(itemId);
  await logEvent(userId, 'ping_done', itemId);
  await ctx.reply(randomCongrats());
}

async function handleMore(ctx: Context, userId: string, itemId: string) {
  // Get current extend count from the most recent ping
  const { data: pings } = await (await import('../db')).supabase
    .from('pings')
    .select('meta')
    .eq('item_id', itemId)
    .eq('kind', 'timer_check')
    .order('due_at', { ascending: false })
    .limit(1);

  const extendCount = (pings?.[0]?.meta as any)?.extend_count ?? 0;

  if (extendCount >= 2) {
    // Offer break
    const kb = new InlineKeyboard()
      .text('5분 쉬기', `rest:${itemId}`)
      .text('계속', `continue:${itemId}`);
    await ctx.reply(moreTimeResponse(extendCount), { reply_markup: kb });
  } else {
    await ctx.reply(moreTimeResponse(extendCount));
  }

  // Schedule next ping +25min
  const dueAt = new Date(Date.now() + 25 * 60 * 1000);
  await schedulePing(userId, itemId, 'timer_check', dueAt, {
    extend_count: extendCount + 1,
  });
  await logEvent(userId, 'ping_more', itemId);
}

async function handleDrift(ctx: Context, userId: string, itemId: string) {
  await logEvent(userId, 'ping_drift', itemId);
  const kb = new InlineKeyboard()
    .text('다시 25분', `drift_resume:${itemId}`)
    .text('오늘은 그만', `drift_stop:${itemId}`);
  await ctx.reply(DRIFT_RESPONSE, { reply_markup: kb });
}

async function handleDriftResume(ctx: Context, userId: string, itemId: string) {
  const dueAt = new Date(Date.now() + 25 * 60 * 1000);
  await schedulePing(userId, itemId, 'timer_check', dueAt, { extend_count: 0 });
  await ctx.reply('ㄱㄱ. 25분 뒤에 볼게.');
}

async function handleDriftStop(ctx: Context, userId: string, itemId: string) {
  await updateItem(itemId, { status: 'snoozed' });
  await cancelPingsForItem(itemId);
  await ctx.reply('오늘 수고했어. 내일 보자.');
}

async function handleRest(ctx: Context, userId: string, itemId: string) {
  const dueAt = new Date(Date.now() + 5 * 60 * 1000);
  await schedulePing(userId, itemId, 'timer_check', dueAt, { extend_count: 0 });
  await ctx.reply('5분 쉬어. 다시 볼게.');
}

async function handleContinue(ctx: Context, userId: string, itemId: string) {
  const dueAt = new Date(Date.now() + 25 * 60 * 1000);
  await schedulePing(userId, itemId, 'timer_check', dueAt, { extend_count: 0 });
  await ctx.reply('ㄱㄱ. 25분 뒤에 볼게.');
}

async function handleDoneConfirm(ctx: Context, userId: string, itemId: string) {
  await updateItem(itemId, { status: 'done' });
  await cancelPingsForItem(itemId);
  await logEvent(userId, 'ping_done', itemId);
  await ctx.reply(randomCongrats());
}

async function handleMorningHour(ctx: Context, userId: string, hour: string) {
  const { updateUser } = await import('../db');
  await updateUser(userId, { morning_hour: parseInt(hour, 10) });
  await ctx.reply(`좋아, 매일 ${hour}시에 카드 보낼게.`);
}

async function showPendingDecisions(ctx: Context, userId: string) {
  const { data: decisions } = await (await import('../db')).supabase
    .from('items')
    .select('title')
    .eq('user_id', userId)
    .eq('type', 'decision')
    .in('status', ['inbox', 'snoozed'])
    .limit(5);

  if (!decisions?.length) {
    await ctx.reply('결정 대기 항목이 없어.');
    return;
  }

  const list = decisions.map((d, i) => `${i + 1}. ${d.title}`).join('\n');
  await ctx.reply(`결정 대기 중:\n${list}`);
}
