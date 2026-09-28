import express from 'express';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { settingsSchema, type Job, type RecommendationResult } from '../shared/schema';
import { rankLocally, recommendationKey, validateInput } from '../shared/ranking';
import { Store } from './store';
import { researchMeta, rerank, safeError } from './openai';

export function createApp(store: Store) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)) return res.status(403).json({ error: '로컬 접속만 지원합니다.' });
    if (req.path.startsWith('/api') && req.method !== 'GET' && req.get('X-OW-Tool') !== '1') return res.status(403).json({ error: '허용되지 않은 요청입니다.' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  let job: Job = { status: 'idle', message: '', startedAt: null };
  const cache = new Map<string, { at: number; result: RecommendationResult }>();
  const pending = new Map<string, Promise<RecommendationResult>>();

  app.get('/api/state', (_req, res) => res.json({ snapshot: store.getSnapshot(), settings: store.getSettings(), keyAvailable: Boolean(process.env.OPENAI_API_KEY), job }));
  app.put('/api/settings', async (req, res) => {
    if (job.status === 'running') return res.status(409).json({ error: '메타 조사 중에는 설정을 변경할 수 없습니다.' });
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '설정 형식을 확인해 주세요.' });
    await store.saveSettings(parsed.data);
    res.json({ settings: store.getSettings() });
  });
  app.get('/api/meta/job', (_req, res) => res.json(job));
  app.post('/api/meta/refresh', (_req, res) => {
    if (!process.env.OPENAI_API_KEY) return res.status(400).json({ error: '서버의 .env에 OPENAI_API_KEY를 설정한 후 재시작해 주세요.' });
    if (job.status === 'running') return res.status(409).json({ error: '이미 메타를 조사하고 있습니다.' });
    const settings = store.getSettings();
    job = { status: 'running', message: '최신 패치와 메타를 검색하고 있습니다. 수 분 걸릴 수 있습니다.', startedAt: new Date().toISOString() };
    res.status(202).json(job);
    void researchMeta(settings).then(async snapshot => {
      await store.saveSnapshot(snapshot);
      cache.clear();
      job = { ...job, status: 'completed', message: '검색 근거와 데이터 형식을 검증하고 메타를 저장했습니다.' };
    }).catch(error => { job = { ...job, status: 'failed', message: safeError(error) }; });
  });
  app.post('/api/recommend', async (req, res) => {
    const meta = store.getSnapshot();
    let input;
    try { input = validateInput(req.body, meta); }
    catch (error) { return res.status(400).json({ error: error instanceof ZodError ? '맵과 팀 조합을 확인해 주세요.' : (error as Error).message }); }
    const candidates = rankLocally(meta, input);
    const fallback = (warning: string): RecommendationResult => ({ mode: 'local', snapshotId: meta.id, candidates: candidates.slice(0, 5), cached: false, warning });
    if (meta.kind === 'demo') return res.json(fallback('체험용 데이터의 로컬 추천입니다. 메타 정보 탭에서 실제 메타를 먼저 불러오세요.'));
    if (!process.env.OPENAI_API_KEY) return res.json(fallback('API 키가 없어 저장된 메타의 로컬 점수를 표시합니다.'));
    const settings = store.getSettings();
    const key = recommendationKey(meta.id, input, settings.rankingModel, settings.rankingEffort);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < 30 * 60 * 1000) return res.json({ ...cached.result, cached: true });
    if (pending.has(key)) return res.json(await pending.get(key));
    if (pending.size >= 3) return res.status(429).json({ error: '추천 요청을 처리 중입니다. 잠시 후 다시 시도해 주세요.' });
    const task = rerank(meta, input, candidates, settings).then(ranked => {
      const result: RecommendationResult = { mode: 'gpt', snapshotId: meta.id, candidates: ranked, cached: false, warning: null };
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: Date.now(), result });
      return result;
    }).catch(error => fallback(`${safeError(error)} 로컬 점수를 대신 표시합니다.`)).finally(() => pending.delete(key));
    pending.set(key, task);
    res.json(await task);
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: '존재하지 않는 API입니다.' }));
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof SyntaxError) return res.status(400).json({ error: '잘못된 요청 형식입니다.' });
    res.status(500).json({ error: '요청을 처리하지 못했습니다. 저장 파일과 서버 상태를 확인해 주세요.' });
  });
  return app;
}
