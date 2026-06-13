import { Context } from 'grammy';
import { classify } from '../pipeline/classify';
import { routeDump } from '../pipeline/router';
import { handleCrisis } from './crisis';
import { sendCard } from '../card';
import { findOpenItemByKeyword, updateItem, logEvent, getUser } from '../db';
import { ackForType, EMOTION_RESPONSE, doneReportConfirm } from '../copy';
import { InlineKeyboard } from 'grammy';

export async function handleDump(ctx: Context, userId: string) {
  const text = ctx.message?.text;
  if (!text) return;

  // Check if user is in paused/soft mode — still accept dumps
  const user = await getUser(Number(ctx.from!.id));

  const result = await classify(text, userId);

  // ── Risk takes priority ──
  if (result.severity === 'crisis') {
    await handleCrisis(ctx, userId, 'crisis');
    return;
  }

  if (result.severity === 'elevated') {
    await handleCrisis(ctx, userId, 'elevated');
    // elevated still processes the dump below
  }

  // ── Intent routing ──
  // ask_card는 type이 null일 때만 (내용이 있으면 dump로 처리)
  // 정규식 프리필터(뭐하지/뭐할까/카드)가 이미 index.ts에서 처리하므로
  // 여기서는 LLM이 내용 없이 ask_card만 판정한 경우에만 카드 발송
  if (result.intent === 'ask_card' && !result.type) {
    await sendCard(userId, async (text, kb) => {
      await ctx.reply(text, kb ? { reply_markup: kb } : undefined);
    });
    return;
  }

  if (result.intent === 'done_report' && result.done_target) {
    const item = await findOpenItemByKeyword(userId, result.done_target);
    if (item) {
      const kb = new InlineKeyboard()
        .text('응', `done_confirm:${item.id}`)
        .text('아니', `done_deny:${item.id}`);
      await ctx.reply(doneReportConfirm(item.title), { reply_markup: kb });
      await logEvent(userId, 'done_report_matched', item.id);
      return;
    }
    // No match → fall through to treat as dump
  }

  // ── Dump processing ──
  const { item, pingAt, pingWarning } = await routeDump(userId, text, result);

  // emotion type → special response, no card
  if (result.type === 'emotion') {
    await ctx.reply(EMOTION_RESPONSE);
    return;
  }

  // ping 검증 실패 경고
  if (pingWarning) {
    await ctx.reply(pingWarning);
    return;
  }

  // Send ack
  if (result.type === 'scheduled' && pingAt) {
    const targetTime = result.due_at ?? result.action_time;
    const ack = formatScheduledAck(pingAt, targetTime!);
    await ctx.reply(ack);
  } else {
    const ack = ackForType(result.type!);
    if (ack) {
      await ctx.reply(ack);
    }
  }
}

function formatScheduledAck(pingAtIso: string, targetIso: string): string {
  const pingDate = new Date(pingAtIso);
  const targetDate = new Date(targetIso);
  const now = new Date();

  const diffMin = Math.round((targetDate.getTime() - pingDate.getTime()) / 60000);
  const isImmediate = pingDate.getTime() - now.getTime() < 60000; // 1분 이내

  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  const isFarOut = pingDate.getTime() - now.getTime() >= TWENTY_FOUR_HOURS;

  const seoulParts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(pingDate);

  const get = (t: string) => seoulParts.find(p => p.type === t)?.value ?? '';
  const month = get('month');
  const day = get('day');
  const weekday = get('weekday');
  const hour24 = Number(get('hour'));
  const minute = Number(get('minute'));

  const period = periodOf(hour24, minute);

  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  const timeStr = minute === 0 ? `${hour12}시` : `${hour12}시 ${minute}분`;

  // 24시간 이상이면 날짜 포함
  const pingLabel = isFarOut
    ? `${month}/${day}(${weekday}) ${period} ${timeStr}`
    : `${period} ${timeStr}`;

  if (isImmediate) {
    return '알겠어. 곧 알려줄게.';
  }

  let deltaLabel: string;
  if (diffMin >= 60) {
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    deltaLabel = mins > 0 ? `${hours}시간 ${mins}분 전` : `${hours}시간 전`;
  } else {
    deltaLabel = `${diffMin}분 전`;
  }

  return `알겠어. ${pingLabel}(${deltaLabel})에 알려줄게.`;
}

/** 시각 → 시간대 텍스트. 경계값은 이전 구간 유지. */
function periodOf(hour24: number, minute: number): string {
  const t = hour24 * 60 + minute; // 분 단위 비교
  if (t < 6 * 60) return '새벽';      // 0:00 ~ 5:59
  if (t < 9 * 60) return '아침';      // 6:00 ~ 8:59
  if (t < 12 * 60) return '오전';     // 9:00 ~ 11:59
  if (t === 12 * 60) return '정오';   // 12:00 정각
  if (t < 17 * 60) return '오후';     // 12:01 ~ 16:59
  if (t < 20 * 60) return '저녁';     // 17:00 ~ 19:59
  if (t < 24 * 60) return '밤';       // 20:00 ~ 23:59
  return '자정';                       // 24:00 (= 0:00)
}
