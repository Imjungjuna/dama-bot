import { InlineKeyboard } from 'grammy';
import { getActiveCard, pickNextCard, logEvent } from './db';
import { cardText, CARD_EMPTY } from './copy';

interface CardPayload {
  text: string;
  keyboard: InlineKeyboard | null;
  itemId: string | null;
}

export async function buildCard(userId: string): Promise<CardPayload> {
  // Enforce single card: if active card exists, re-send it
  const active = await getActiveCard(userId);
  if (active) {
    return {
      text: cardText(active.title, active.first_action ?? '시작하기', active.est_minutes),
      keyboard: cardButtons(active.id),
      itemId: active.id,
    };
  }

  const item = await pickNextCard(userId);
  if (!item) {
    return { text: CARD_EMPTY, keyboard: null, itemId: null };
  }

  return {
    text: cardText(item.title, item.first_action ?? '시작하기', item.est_minutes),
    keyboard: cardButtons(item.id),
    itemId: item.id,
  };
}

export async function sendCard(
  userId: string,
  sendFn: (text: string, keyboard?: InlineKeyboard) => Promise<void>,
): Promise<void> {
  const card = await buildCard(userId);

  if (card.keyboard) {
    await sendFn(card.text, card.keyboard);
    await logEvent(userId, 'card_sent', card.itemId);
  } else {
    await sendFn(card.text);
  }
}

function cardButtons(itemId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('시작', `start:${itemId}`)
    .text('나중에', `later:${itemId}`)
    .row()
    .text('더 쪼개줘', `split:${itemId}`)
    .text('버려', `drop:${itemId}`);
}
