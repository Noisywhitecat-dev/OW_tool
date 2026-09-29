import express from 'express';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { settingsSchema, type RecommendationResult } from '../shared/schema';
import { rankLocally, recommendationKey, validateInput } from '../shared/ranking';
import { Store } from './store';
import { keyAvailable, rank, aiError } from './ai';

export function createApp(store: Store, overrides: { rerank?: typeof rank } = {}, staticDirectory = resolve('dist'), sessionToken?: string) {
  const app = express();
  const rerank = overrides.rerank ?? rank;
  const cache = new Map<string, { at: number; result: RecommendationResult }>();
  const pending = new Map<string, Promise<RecommendationResult>>();
  let saving = false;
  app.locals.isBusy = () => pending.size > 0 || saving;
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (sessionToken && req.get('X-OW-Session') !== sessionToken) return res.status(403).json({ error: '앱 창에서만 사용할 수 있습니다.' });
    if (!['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)) return res.status(403).json({ error: '로컬 접속만 지원합니다.' });
    if (req.path.startsWith('/api') && req.method !== 'GET' && req.get('X-OW-Tool') !== '1') return res.status(403).json({ error: '허용되지 않은 요청입니다.' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
    next();
  });
  app.use('/api/meta/import', express.json({ limit: '8mb' }));
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/state', (_req, res) => res.json({ snapshot: store.getSnapshot(), settings: store.getSettings(), keyAvailable: keyAvailable(store.getSettings().provider), keysAvailable: { gemini: keyAvailable('gemini'), openai: keyAvailable('openai') } }));
  app.put('/api/settings', async (req, res) => {
    if (app.locals.isBusy()) return res.status(409).json({ error: '진행 중인 요청이 끝난 뒤 설정을 변경해 주세요.' });
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '설정 형식을 확인해 주세요.' });
    saving = true;
    try { await store.saveSettings(parsed.data); cache.clear(); res.json({ settings: store.getSettings() }); }
    finally { saving = false; }
  });
  app.post('/api/meta/import', async (req, res) => {
    if (app.locals.isBusy()) return res.status(409).json({ error: '진행 중인 요청이 끝난 뒤 메타를 교체해 주세요.' });
    saving = true;
    try { await store.saveSnapshot(req.body); }
    catch { return res.status(400).json({ error: '메타 파일의 형식·참조·출처 또는 저장 경로를 확인해 주세요. 기존 메타는 유지됩니다.' }); }
    finally { saving = false; }
    cache.clear(); res.json({ snapshot: store.getSnapshot() });
  });
  app.post('/api/recommend', async (req, res) => {
    if (saving) return res.status(409).json({ error: '설정 또는 메타 저장이 끝난 뒤 추천해 주세요.' });
    const meta = store.getSnapshot(); let input;
    try { input = validateInput(req.body, meta); }
    catch (error) { return res.status(400).json({ error: error instanceof ZodError ? '맵과 팀 조합을 확인해 주세요.' : (error as Error).message }); }
    const candidates = rankLocally(meta, input);
    const fallback = (warning: string): RecommendationResult => ({ mode: 'local', snapshotId: meta.id, candidates: candidates.slice(0, 5), cached: false, warning });
    if (meta.kind === 'demo') return res.json(fallback('체험용 데이터입니다. Codex에서 검토한 메타 파일을 먼저 적용해 주세요.'));
    const settings = store.getSettings();
    if (!keyAvailable(settings.provider)) return res.json(fallback('API 키가 없어 저장된 메타의 로컬 점수를 표시합니다.'));
    const key = recommendationKey(meta.id, input, settings.provider + ':' + settings.rankingModel, settings.rankingEffort);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < 30 * 60 * 1000) return res.json({ ...cached.result, cached: true });
    if (pending.has(key)) return res.json(await pending.get(key));
    if (pending.size >= 3) return res.status(429).json({ error: '추천 요청을 처리 중입니다. 잠시 후 다시 시도해 주세요.' });
    const task = rerank(meta, input, candidates, settings).then(ranked => {
      const result: RecommendationResult = { mode: 'gpt', snapshotId: meta.id, candidates: ranked, cached: false, warning: null };
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: Date.now(), result }); return result;
    }).catch(error => fallback(`${aiError(error)} 로컬 점수를 대신 표시합니다.`)).finally(() => pending.delete(key));
    pending.set(key, task); res.json(await task);
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: '존재하지 않는 API입니다.' }));
  app.use(express.static(staticDirectory)); app.get('/{*path}', (_req, res) => res.sendFile(resolve(staticDirectory, 'index.html')));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof SyntaxError) return res.status(400).json({ error: '잘못된 요청 형식입니다.' });
    res.status(500).json({ error: '요청을 처리하지 못했습니다. 저장 파일과 서버 상태를 확인해 주세요.' });
  }); return app;
}
