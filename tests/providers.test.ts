import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { OverFast, SourceError } from '../server/overfast';
import { Gemini } from '../server/gemini';
import { statisticsForPrompt, validateStatistics } from '../shared/statistics';
import { defaultSettings } from '../shared/prompts';
import { settingsSchema, validateSnapshot } from '../shared/schema';
import { demoSnapshot } from '../shared/demo';
import { rankLocally } from '../shared/ranking';
import { Store } from '../server/store';
import { createApp } from '../server/app';

const heroes = demoSnapshot.heroes.map(h => ({ key: h.id, name: h.name, role: h.role, gamemodes: ['quickplay'], portrait: 'https://example.com/hero.png' }));
const maps = [{ key: 'kings-row', name: "King's Row", gamemodes: ['hybrid'] }, { key: 'arena', name: 'Arena', gamemodes: ['deathmatch'] }];
const rows = heroes.map(h => ({ hero: h.key, winrate: h.key === heroes[0].key ? 0 : 52, pickrate: 3, banrate: null }));
const fixtureFetch = vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(String(url).includes('/heroes?') ? heroes : String(url).endsWith('/maps') ? maps : rows), { headers: { 'cache-control': 'public, max-age=3600', age: '17' } }));
let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'ow-provider-test-')); fixtureFetch.mockClear(); });
afterEach(async () => { vi.unstubAllEnvs(); if (!resolve(directory).startsWith(resolve(tmpdir()) + '/ow-provider-test-') && !resolve(directory).startsWith(resolve(tmpdir()) + '\\ow-provider-test-')) throw new Error('Unsafe cleanup'); await rm(directory, { recursive: true }); });
const provider = () => new OverFast(join(directory, 'cache'), fixtureFetch as typeof fetch, async () => {});
const bundle = () => provider().collect('diamond');

describe('public statistics', () => {
  it('keeps original zeroes, provenance and upstream cache age, but marks zeroes unknown for AI', async () => {
    const data = await bundle();
    expect(data.overall.data[0].winrate).toBe(0);
    expect(statisticsForPrompt(data).overall.rows[0][1]).toBeNull();
    expect(data.overall.upstreamAgeSeconds).toBe(17);
    expect(data.heroes.data[0].portrait).toContain('example.com');
    expect(data.byMap.map(m => m.mapId)).toEqual(['kings-row']);
  });
  it('maps champion to GM without labelling it champion-only or KR-only', async () => {
    const data = await provider().collect('champion');
    expect(data.requestedRank).toBe('champion'); expect(data.actualRank).toBe('grandmaster');
    expect(data.region).toBe('asia'); expect(data.requestedRegion).toBe('KR');
    expect(data.overall.url).toContain('competitive_division=grandmaster');
  });
  it('reuses disk cache across instances and separates rank scopes', async () => {
    await bundle(); expect(fixtureFetch).toHaveBeenCalledTimes(4);
    await bundle(); expect(fixtureFetch).toHaveBeenCalledTimes(4);
    await provider().collect('emerald'); expect(fixtureFetch).toHaveBeenCalledTimes(6);
  });
  it('refetches expired/corrupt cache without using stale data as new', async () => {
    await bundle();
    const files = await readdir(join(directory, 'cache'));
    for (const file of files) { const name = join(directory, 'cache', file); const data = JSON.parse(await readFile(name, 'utf8')); data.fetchedAt = '2000-01-01T00:00:00.000Z'; await writeFile(name, JSON.stringify(data)); }
    await bundle(); expect(fixtureFetch).toHaveBeenCalledTimes(8);
  });
  it('honors Retry-After and never exceeds three attempts for a public request', async () => {
    const pause = vi.fn(async (_ms: number) => {});
    const unavailable = vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': '2' } }));
    await expect(new OverFast(directory, unavailable as typeof fetch, pause).collect('all')).rejects.toBeInstanceOf(SourceError);
    expect(unavailable).toHaveBeenCalledTimes(3); expect(pause).toHaveBeenCalledWith(2000);
  });
  it('does not retry earlier than a long Retry-After', async () => {
    const unavailable = vi.fn(async () => new Response('', { status: 503, headers: { 'retry-after': '90' } }));
    await expect(new OverFast(directory, unavailable as typeof fetch, async () => {}).collect('all')).rejects.toThrow();
    expect(unavailable).toHaveBeenCalledTimes(1);
  });
  it('rejects duplicate/unknown heroes and mismatched provenance scope', async () => {
    const data = await bundle(); data.overall.data.push(data.overall.data[0]);
    expect(() => validateStatistics(data)).toThrow(); data.overall.data.pop();
    data.overall.data[0].hero = 'unknown'; expect(() => validateStatistics(data)).toThrow();
    data.overall.data[0].hero = heroes[0].key; data.actualRank = 'master'; expect(() => validateStatistics(data)).toThrow();
    data.actualRank = 'diamond'; data.overall.url = data.overall.url.replace('asia', 'europe'); expect(() => validateStatistics(data)).toThrow();
  });
});


const input = { mapId: 'kings-row', role: 'support' as const, side: 'either' as const, ownSlot: 3, allies: [null,null,null,null,null], enemies: [null,null,null,null,null] };
describe('offline meta and runtime boundary', () => {
  it('imports validated meta, persists it, and preserves it after invalid imports', async () => {
    const store = new Store(directory, demoSnapshot); await store.initialize(); const app=createApp(store);
    const changed={...demoSnapshot,id:'imported-test'};
    expect((await request(app).post('/api/meta/import').set('X-OW-Tool','1').send(changed)).status).toBe(200);
    expect((await request(app).post('/api/meta/import').set('X-OW-Tool','1').send({...changed,heroes:[]})).status).toBe(400);
    const restarted=new Store(directory); await restarted.initialize(); expect(restarted.getSnapshot().id).toBe('imported-test');
  });
  it('has no research or collection API and never calls AI without a key', async () => {
    vi.stubEnv('GEMINI_API_KEY',''); vi.stubEnv('OPENAI_API_KEY','');
    const store=new Store(directory);await store.initialize();const rerank=vi.fn();const app=createApp(store,{rerank});
    for(const route of ['/api/meta/refresh','/api/statistics/refresh']) expect((await request(app).post(route).set('X-OW-Tool','1').send({})).status).toBe(404);
    expect((await request(app).get('/api/meta/job')).status).toBe(404);
    const result=await request(app).post('/api/recommend').set('X-OW-Tool','1').send(input);
    expect(result.status).toBe(200);expect(result.body.mode).toBe('local');expect(rerank).not.toHaveBeenCalled();
  });
  it('deduplicates in-flight recommendations, blocks metadata/settings changes, caches and invalidates', async () => {
    vi.stubEnv('GEMINI_API_KEY','fake-test-key');const store=new Store(directory);await store.initialize();
    let finish!: (value: ReturnType<typeof rankLocally>) => void;
    const rerank=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockImplementation(async (meta,match,candidates)=>candidates.slice(0,5));
    const app=createApp(store,{rerank});
    const call=()=>request(app).post('/api/recommend').set('X-OW-Tool','1').send(input).then(r=>r);
    const first=call();await vi.waitFor(()=>expect(rerank).toHaveBeenCalledTimes(1));const second=call();
    expect((await request(app).post('/api/meta/import').set('X-OW-Tool','1').send(store.getSnapshot())).status).toBe(409);
    expect((await request(app).put('/api/settings').set('X-OW-Tool','1').send(defaultSettings)).status).toBe(409);
    finish(rankLocally(store.getSnapshot(),input).slice(0,5));await Promise.all([first,second]);
    expect((await call()).body.cached).toBe(true);expect(rerank).toHaveBeenCalledTimes(1);
    // Same ID imports must still invalidate the cache.
    expect((await request(app).post('/api/meta/import').set('X-OW-Tool','1').send(store.getSnapshot())).status).toBe(200);
    await call();expect(rerank).toHaveBeenCalledTimes(2);
  });
  it('rejects requests without the desktop session token and does not expose keys',async()=>{
    vi.stubEnv('GEMINI_API_KEY','private-test-key');const store=new Store(directory);await store.initialize();const app=createApp(store,{},directory,'session-test');
    expect((await request(app).get('/api/state')).status).toBe(403);
    const state=await request(app).get('/api/state').set('X-OW-Session','session-test');expect(state.status).toBe(200);expect(JSON.stringify(state.body)).not.toContain('private-test-key');
  });
  it('loads old OpenAI settings without silently switching providers',()=>{
    expect(settingsSchema.parse({rankingModel:'gpt-6-astra',rankingEffort:'low',researchModel:'unused'}).provider).toBe('openai');
  });
});
describe('Gemini without real AI calls',()=>{
  const candidates=rankLocally(demoSnapshot,input);
  const body={recommendations:candidates.slice(0,5).map(c=>({heroId:c.hero.id,reason:'stored evidence',caution:''}))};
  const response=(value:unknown,finishReason='STOP')=>new Response(JSON.stringify({candidates:[{finishReason,content:{parts:[{text:JSON.stringify(value)}]}}]}));
  it('makes one structured recommendation request with no tools, search or key in URL',async()=>{
    const mock=vi.fn(async()=>response(body));const result=await new Gemini(mock as typeof fetch,()=> 'private-test-key').rerank(demoSnapshot,input,candidates,defaultSettings);
    expect(result).toHaveLength(5);expect(mock).toHaveBeenCalledTimes(1);
    const [url,init]=(mock.mock.calls as unknown as [string,RequestInit][])[0];expect(url).not.toContain('private-test-key');
    const sent=JSON.parse(init.body as string);expect(sent.tools).toBeUndefined();expect(sent.generationConfig.responseMimeType).toBe('application/json');expect(sent.generationConfig.thinkingConfig.thinkingBudget).toBe(1024);
  });
  it('does not retry quota failures or accept unfinished output',async()=>{
    const quota=vi.fn(async()=>new Response('',{status:429}));await expect(new Gemini(quota as typeof fetch,()=> 'test').rerank(demoSnapshot,input,candidates,defaultSettings)).rejects.toThrow(/한도/);expect(quota).toHaveBeenCalledTimes(1);
    const truncated=vi.fn(async()=>response(body,'MAX_TOKENS'));await expect(new Gemini(truncated as typeof fetch,()=> 'test').rerank(demoSnapshot,input,candidates,defaultSettings)).rejects.toThrow();expect(truncated).toHaveBeenCalledTimes(1);
  });
  it('rejects invented hero IDs without a second model request',async()=>{
    const bad=structuredClone(body);bad.recommendations[0].heroId='invented';const mock=vi.fn(async()=>response(bad));
    await expect(new Gemini(mock as typeof fetch,()=> 'test').rerank(demoSnapshot,input,candidates,defaultSettings)).rejects.toThrow();expect(mock).toHaveBeenCalledTimes(1);
  });
});
