import { llmCall, parseJsonResponse } from '../llm';

interface SplitResult {
  first_action: string;
  steps: string[];
}

const SYSTEM_PROMPT = `사용자가 ADHD 시작마비 상태다. 아래 first_action이 여전히 커서 시작을 못 한다. 물리적으로 더 작은 첫 동작으로 다시 쪼개라.
첫 동작은 2분 내 완료 가능해야 하고, 동사로 시작해야 한다.

입력: { "title": "...", "first_action": "..." }
출력: { "first_action": "...", "steps": ["...", "...", "..."] }
JSON만 출력. steps는 최대 3개.`;

export async function splitAction(title: string, firstAction: string): Promise<SplitResult> {
  const userMessage = JSON.stringify({ title, first_action: firstAction });
  const raw = await llmCall(SYSTEM_PROMPT, userMessage);
  return parseJsonResponse<SplitResult>(raw);
}
