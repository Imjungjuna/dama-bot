import { llmCall, parseJsonResponse } from '../llm';
import { logEvent } from '../db';

export interface ClassifyResult {
  severity: 'none' | 'elevated' | 'crisis';
  intent: 'dump' | 'ask_card' | 'done_report' | 'chat';
  type: 'action' | 'scheduled' | 'decision' | 'someday' | 'emotion' | 'memory' | null;
  title: string | null;
  first_action: string | null;
  est_minutes: number;
  schedule_kind: 'deadline' | 'timed' | null;
  due_at: string | null;
  action_time: string | null;
  remind_at_explicit: string | null;
  done_target: string | null;
  options: string[] | null;
}

const SYSTEM_PROMPT = `당신은 ADHD 사용자의 머릿속 덤프를 분류하는 시스템이다.
입력: 사용자가 메신저에 던진 비정형 한국어 텍스트 1건과 현재 시각.
출력: 아래 JSON만. 설명·마크다운 금지.

{
  "severity": "none | elevated | crisis",
  "intent": "dump | ask_card | done_report | chat",
  "type": "action | scheduled | decision | someday | emotion | memory | null",
  "title": "시간·날짜 표현을 제외한 핵심 내용만 15자 이내 (type이 non-null이면 필수). 예: '내일 오후 3시에 미팅 있어' → '미팅', '금요일까지 세금 신고' → '세금 신고', '2시간 뒤에 엄마한테 전화' → '엄마한테 전화'",
  "first_action": "2분 안에 시작 가능한 첫 물리적 동작 (type=action일 때만)",
  "est_minutes": 25,
  "schedule_kind": "deadline | timed | null",
  "due_at": "ISO8601 (schedule_kind=deadline일 때 마감 시점. 날짜만이면 23:59:59. 아니면 null)",
  "action_time": "ISO8601 (schedule_kind=timed일 때 실행 시점. 아니면 null)",
  "remind_at_explicit": "ISO8601 (사용자가 알림 시간을 명시한 경우만. 아니면 null)",
  "done_target": "intent=done_report일 때 완료 대상 추정 키워드, 아니면 null",
  "options": ["선택지1", "선택지2"] // type=decision이고 선택지가 명시된 경우만, 아니면 null
}

규칙:
1. severity 판정이 모든 것에 우선한다. 자해·자살·소멸 욕구의 암시("사라지고 싶다", "끝내고 싶다", "살기 싫다" 등)는 맥락이 모호해도 crisis. 강한 자기비난·무망감("난 쓰레기야", "다 의미없어")은 elevated. 확신이 없으면 한 단계 높게 판정한다.
2. 반추·후회·불안·푸념은 emotion이다. emotion을 action으로 바꾸지 마라. 감정 문장에 할 일이 섞여 있으면 감정이 지배적일 때 emotion을 택한다.
3. first_action은 동사로 시작하고 도구·대상을 명시한다. 좋은 예: "CryptoHack 탭 열고 로그인". 나쁜 예: "공부 시작하기".
4. 시점 표현이 하나라도 있으면 type은 반드시 scheduled이다. scheduled는 두 종류로 나뉜다:
   - schedule_kind=deadline (기한 태스크): "~까지", "~전에", "~마감" → due_at에 마감 시점. 날짜만이면 그 날 23:59:59. 시간 명시면 해당 시각. action_time=null.
   - schedule_kind=timed (시점 태스크): "~에", "~때", "~시에" → action_time에 실행 시점. due_at=null.
   사용자가 알림 시간도 명시한 경우("2시에 알려줘", "1시간 전에 리마인드") remind_at_explicit에 해당 시각을 ISO8601로 환산.
   예시:
   - "금요일까지 세금 신고" → deadline, due_at=금요일 23:59:59
   - "내일 3시에 면접" → timed, action_time=내일 15:00
   - "금요일 3시 회의인데 1시에 알려줘" → timed, action_time=금요일 15:00, remind_at_explicit=금요일 13:00
5. action vs someday 판별은 "시작점이 구체적인가?"로 결정한다.
   action의 조건 (전부 충족해야 action):
   - 대상이 특정됨 ("러스트 책", "그 영화", "이력서")
   - 시작 방법이 자명함 (열기/펼치기/접속하기 등)
   - 시작 여부에 고민 없음 (할 건 맞는데 아직 안 한 것)
   someday로 빠지는 신호 (하나라도 해당되면 someday):
   - 대상이 불특정 ("영화 좀", "운동", "코딩 실력")
   - 방법/수단 미정 ("공부해봐야", "해볼까")
   - 의지 표현이 약함 ("~싶다", "~볼까", "~하는데..")
   예시:
   - "러스트 책 산거 튜토리얼 해봐야해" → action (자원 있고 시작 가능)
   - "러스트 공부해봐야 하는데" → someday (뭘로 어떻게 할지 없음)
   - "블로그 글 써야지" → action (에디터 열고 시작 가능)
   - "블로그 해볼까" → someday (플랫폼도 주제도 미정)
   - "그 영화 봐야하는데" → action (특정 영화, 재생만 누르면 됨)
   - "영화 좀 봐야하는데" → someday (뭘 볼지 미정)
6. decision은 행동/상태 변화에 대해 결론이 나지 않은 고민이다. 선택지가 명시되지 않아도 된다. "고민 중", "어떡하지", "해야 하나 말아야 하나" 같은 결론 미정 상태면 decision. 선택지가 있으면 options 배열에 담고, 없으면 null.
7. 감정 토로만 있고 행동/변화 고민이 아니면 emotion. ("나 왜 이러지", "오늘 짜증나")
8. intent 판정: 입력에 분류 가능한 내용(할 일, 일정, 고민, 감정 등)이 있으면 반드시 intent=dump. ask_card는 "뭐하지", "카드 줘"처럼 내용 없이 카드만 요청할 때만. type이 non-null이면 intent는 반드시 dump.`;

const FALLBACK: ClassifyResult = {
  severity: 'none',
  intent: 'dump',
  type: 'action',
  title: '분류 실패 항목',
  first_action: null,
  est_minutes: 25,
  schedule_kind: null,
  due_at: null,
  action_time: null,
  remind_at_explicit: null,
  done_target: null,
  options: null,
};

export async function classify(text: string, userId: string): Promise<ClassifyResult> {
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const userMessage = `현재 시각: ${now}\n입력: ${text}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await llmCall(SYSTEM_PROMPT, userMessage);
      const result = parseJsonResponse<ClassifyResult>(raw);

      // Validate required fields
      if (!result.severity || !result.intent) throw new Error('Missing required fields');

      console.log('[classify]', JSON.stringify(result, null, 2));
      return result;
    } catch (err) {
      if (attempt === 1) {
        await logEvent(userId, 'llm_parse_fail', null, {
          error: String(err),
          text: text.slice(0, 100),
        });
        return { ...FALLBACK, title: text.slice(0, 15) };
      }
    }
  }

  return FALLBACK; // unreachable but satisfies TS
}
