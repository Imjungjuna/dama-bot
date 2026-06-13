// ── 모든 봇 멘트 단일 파일 ──
// 톤: 반말, 최대 3문장
// 금지어: "아직도", "또", "벌써", "놓쳤네", "겨우", "왜 안 했어"
// 프레임: 더하기만. 한 것을 말하고, 안 한 것은 언급하지 않는다.

// ── 온보딩 ──

export const ONBOARDING = [
  '나는 네 머릿속을 대신 정리하는 봇이야. 떠오르는 건 뭐든 그냥 던져. 할 일, 아이디어, 걱정, 아무거나.',
  '정리·분류·다시 꺼내주기는 내가 해. 너는 아무것도 관리 안 해도 돼.',
  '아침에 카드 1장 보낼게. 몇 시가 좋아?',
] as const;

// ── 접수 멘트 (type별) ──

const ACK: Record<string, string> = {
  action: '받았어. 카드로 만들어둘게.',
  scheduled: '다시 꺼내줄게.',
  decision: '결정 대기함에 넣었어. 주말에 같이 보자.',
  someday: '금고에 넣었어. 한 달 뒤에 물어볼게.',
  emotion: '',
  memory: '기억해둘게.',
};

export function ackForType(type: string, dueLabel?: string): string {
  if (type === 'scheduled' && dueLabel) {
    return `${dueLabel}에 다시 꺼내줄게.`;
  }
  return ACK[type] ?? '받았어.';
}

// ── 카드 ──

export function cardText(title: string, firstAction: string, estMinutes: number): string {
  return `🎯 지금 이거 하나\n\n${title}\n첫 동작: ${firstAction}\n⏱ ${estMinutes}분`;
}

export const CARD_EMPTY = '지금은 비었어. 머리에 있는 거 던져.';

// ── 버튼 응답 ──

export function startResponse(estMinutes: number): string {
  return `ㄱㄱ. ${estMinutes}분 뒤에 볼게.`;
}

export const LATER_RESPONSE = '내일 아침에 다시 꺼낼게.';
export const DROP_RESPONSE = '버렸어. 버리는 것도 처리야.';

// ── 타이머 핑 ──

export const TIMER_CHECK = '끝났어?';

export const DONE_CONGRATS = [
  '깔끔하게 끝냈네.',
  '하나 해치웠다.',
  '한 칸 전진.',
  '됐어, 잘했어.',
  '루프 하나 닫았다.',
] as const;

export function randomCongrats(): string {
  return DONE_CONGRATS[Math.floor(Math.random() * DONE_CONGRATS.length)];
}

export function moreTimeResponse(count: number): string {
  if (count >= 2) {
    return '오래 붙잡고 있네. 쉬었다 갈까?';
  }
  return '+25분 추가했어.';
}

export const DRIFT_RESPONSE = '그럴 수 있어.';

// ── 재부상 ──

export function somedayCheck(title: string): string {
  return `${title} — 아직 관심 있어?`;
}

export function doneReportConfirm(title: string): string {
  return `이거 완료 처리할까? — ${title}`;
}

// ── 주간 정산 ──

export function weeklyDigest(
  dumps: number,
  done: number,
  archived: number,
  dropped: number,
  pendingDecisions: number,
): string {
  const processed = done + archived + dropped;
  let text = `이번 주 정산 🧾\n덤프 ${dumps}개 → 처리 ${done} · 보관 ${archived} · 버림 ${dropped}\n닫은 루프 ${done}개. 머리가 그만큼 가벼워졌어.`;
  if (pendingDecisions > 0) {
    text += `\n\n결정 기다리는 게 ${pendingDecisions}개 있어. 볼래?`;
  }
  return text;
}

// ── 주간 브리핑 ──

interface BriefingItems {
  actions: { title: string }[];
  decisions: { title: string; options: string[] | null }[];
  somedays: { title: string }[];
  memories: { title: string }[];
}

export function weeklyBriefing(items: BriefingItems): string {
  const sections: string[] = ['이번 주 브리핑 🧾'];

  if (items.actions.length > 0) {
    const list = items.actions.map((a, i) => `  ${i + 1}. ${a.title}`).join('\n');
    sections.push(`\n할 일 (${items.actions.length})\n${list}`);
  }

  if (items.decisions.length > 0) {
    const list = items.decisions.map((d, i) => {
      const opts = d.options ? ` → ${d.options.join(' / ')}` : '';
      return `  ${i + 1}. ${d.title}${opts}`;
    }).join('\n');
    sections.push(`\n결정 대기 (${items.decisions.length})\n${list}`);
  }

  if (items.somedays.length > 0) {
    const list = items.somedays.map((s, i) => `  ${i + 1}. ${s.title}`).join('\n');
    sections.push(`\n언젠가 (${items.somedays.length})\n${list}`);
  }

  if (items.memories.length > 0) {
    const list = items.memories.map((m, i) => `  ${i + 1}. ${m.title}`).join('\n');
    sections.push(`\n기억 (${items.memories.length})\n${list}`);
  }

  if (sections.length === 1) {
    return '이번 주 브리핑 🧾\n머리가 비어있어. 좋은 상태야.';
  }

  return sections.join('\n');
}

// ── 감정 / 위기 ──

export const EMOTION_RESPONSE =
  '그 생각이 계속 도는구나. 여기 적었으니 머리에서는 꺼내두자. 이건 할 일이 아니라 지나가는 생각으로 보관할게.';

export const ELEVATED_RESPONSE =
  '요 며칠 덤프에 자책이 많이 보여서. 카드 잠깐 멈춰둘까? 오늘은 아무것도 안 해도 돼. 혹시 요즘 이런 얘기 나눌 사람이 곁에 있어?';

export const CRISIS_RESPONSE =
  '지금 많이 힘든 것 같아. 말해줘서 고마워.\n나는 도구라서 이런 순간에 필요한 도움을 다 줄 순 없어.\n지금 연락할 수 있는 사람이 있다면 한 명에게 닿아보면 좋겠어.\n자살예방 상담전화 109는 24시간 연결되고, 위급한 상황이면 112나 119야.\n여기에 계속 적어도 괜찮아 — 할 일 얘기는 전부 멈춰둘게.';

export const CRISIS_FALSE_ALARM = '알겠어, 다행이야. 필요하면 언제든.';

// ── Pause/Resume ──

export const PAUSED = '알겠어. 카드랑 알림 멈출게. 덤프는 계속 받아.';
export const RESUMED = '다시 시작할게.';

// ── 음성 ──

export const VOICE_NOT_SUPPORTED = '지금은 텍스트만 받아. 곧 음성도 들을게.';
