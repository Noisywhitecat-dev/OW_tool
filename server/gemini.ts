import { z } from 'zod';
import { rankingOutputSchema, type Candidate, type RecommendationInput, type Settings, type Snapshot } from '../shared/schema';
import { RANKING_PROMPT } from '../shared/prompts';
import { applyRanking } from './openai';

export class GeminiError extends Error {}
const responseSchema = z.object({ candidates: z.array(z.object({
  finishReason: z.string(), content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }),
})).min(1) });
const budget = { low: 1024, medium: 4096 };

export class Gemini {
  constructor(private request: typeof fetch = fetch, private key = () => process.env.GEMINI_API_KEY) {}
  private async generate(model: string, prompt: string, effort: keyof typeof budget, schema?: z.ZodType) {
    const key = this.key();
    if (!key) throw new GeminiError('서버에 GEMINI_API_KEY를 설정해 주세요.');
    // Only this verified free-tier-capable model is offered. Billing still depends on the Google project.
    if (model !== 'gemini-2.5-flash') throw new GeminiError('Gemini 모드는 검증된 gemini-2.5-flash 설정을 사용해 주세요.');
    const jsonSchema = schema ? z.toJSONSchema(schema) : undefined;
    if (jsonSchema) delete jsonSchema.$schema;
    let response: Response;
    try {
      response = await this.request(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(600_000),
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { thinkingConfig: { thinkingBudget: budget[effort] }, maxOutputTokens: 6000,
            ...(schema ? { responseMimeType: 'application/json', responseJsonSchema: jsonSchema } : {}) } }),
      });
    } catch { throw new GeminiError('Gemini 연결이 끊겼거나 시간이 초과되었습니다. 자동 재시도하지 않았습니다.'); }
    if (!response.ok) throw new GeminiError(response.status === 429 ? 'Gemini 무료 티어 또는 요청 한도에 도달했습니다. 유료 서비스로 전환하지 않았습니다. 잠시 후 다시 시도해 주세요.' : `Gemini 요청 실패(HTTP ${response.status}). 키·모델·프로젝트 권한을 확인해 주세요.`);
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.candidates[0].finishReason !== 'STOP') throw new GeminiError('Gemini 응답이 차단되었거나 완성되지 않았습니다. 기존 메타는 유지됩니다.');
    const candidate = parsed.data.candidates[0];
    return { text: candidate.content.parts.filter(p => !p.thought).map(p => p.text ?? '').join('') };
  }
  async rerank(meta: Snapshot, input: RecommendationInput, candidates: Candidate[], settings: Settings) {
    const response = await this.generate(settings.rankingModel, RANKING_PROMPT + '\n' + JSON.stringify({ patch: meta.patch, scope: meta.scope, limitations: meta.limitations, map: meta.maps.find(m => m.id === input.mapId), input,
      allies: input.allies.map(id => meta.heroes.find(h => h.id === id) ?? null), enemies: input.enemies.map(id => meta.heroes.find(h => h.id === id) ?? null), candidates }), settings.rankingEffort, rankingOutputSchema);
    return applyRanking(candidates, JSON.parse(response.text));
  }
}
