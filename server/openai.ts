import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { rankingOutputSchema, type Candidate, type RecommendationInput, type Settings, type Snapshot } from '../shared/schema';
import { RANKING_PROMPT } from '../shared/prompts';

function client() {
  if (!process.env.OPENAI_API_KEY) throw new Error('서버의 .env에 OPENAI_API_KEY를 설정해 주세요.');
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 600_000, maxRetries: 0 });
}

export function safeError(error: unknown) {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) return 'API 키 인증에 실패했습니다. 서버의 키를 확인해 주세요.';
    if (error.status === 429) return 'API 사용량 또는 요청 한도에 도달했습니다. OpenAI 계정 한도를 확인해 주세요.';
    if (error.status === 403 || error.status === 404) return '설정된 모델에 접근할 수 없습니다. 모델 ID와 계정 권한을 확인해 주세요.';
    return 'OpenAI 요청에 실패했습니다. 모델 설정과 네트워크 상태를 확인해 주세요. 기존 메타는 유지됩니다.';
  }
  // Never return provider payloads or internal exception messages to the browser.
  return '응답 검증 또는 저장에 실패했습니다. 기존 메타는 유지됩니다. 다시 시도해 주세요.';
}

export function applyRanking(candidates: Candidate[], output: unknown): Candidate[] {
  const parsed = rankingOutputSchema.parse(output);
  const ids = parsed.recommendations.map(r => r.heroId);
  if (new Set(ids).size !== 5 || ids.some(id => !candidates.some(c => c.hero.id === id))) throw new Error('후보 범위 밖 추천');
  return parsed.recommendations.map(row => {
    const candidate = candidates.find(c => c.hero.id === row.heroId)!;
    return { ...candidate, reasons: [row.reason, ...candidate.reasons], caution: [row.caution, ...candidate.missing].filter(Boolean).join(' · ') };
  });
}

export async function rerank(meta: Snapshot, input: RecommendationInput, candidates: Candidate[], settings: Settings) {
  const response = await client().responses.parse({
    model: settings.rankingModel, reasoning: { effort: settings.rankingEffort }, store: false,
    max_output_tokens: 6000,
    input: [
      { role: 'system', content: RANKING_PROMPT },
      { role: 'user', content: JSON.stringify({ patch: meta.patch, scope: meta.scope, limitations: meta.limitations,
        map: meta.maps.find(m => m.id === input.mapId), side: input.side,
        allies: input.allies.map(id => meta.heroes.find(h => h.id === id) ?? null),
        enemies: input.enemies.map(id => meta.heroes.find(h => h.id === id) ?? null), candidates }) },
    ],
    text: { format: zodTextFormat(rankingOutputSchema, 'hero_ranking') },
  });
  if (response.status !== 'completed' || !response.output_parsed) throw new Error('불완전한 추천 응답');
  return applyRanking(candidates, response.output_parsed);
}
