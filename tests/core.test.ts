import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { demoSnapshot } from '../shared/demo';
import { defaultSettings } from '../shared/prompts';
import { rankLocally, recommendationKey, validateInput } from '../shared/ranking';
import { validateSnapshot, type RecommendationInput } from '../shared/schema';
import { applyRanking } from '../server/openai';
import { Store } from '../server/store';
import { createApp } from '../server/app';

const input = (): RecommendationInput => ({ mapId: 'kings-row', role: 'support', side: 'either', ownSlot: 3, allies: [null, null, null, null, null], enemies: [null, null, null, null, null] });

describe('ranking contracts', () => {
  it('returns role-matching unique candidates, excluding an ally but permitting enemy mirrors', () => {
    const match = input(); match.allies[4] = 'ana'; match.enemies[3] = 'kiriko';
    const ranked = rankLocally(demoSnapshot, match);
    expect(ranked.every(c => c.hero.role === 'support')).toBe(true);
    expect(ranked.some(c => c.hero.id === 'ana')).toBe(false);
    expect(ranked.some(c => c.hero.id === 'kiriko')).toBe(true);
    expect(new Set(ranked.slice(0, 5).map(c => c.hero.id)).size).toBe(5);
  });
  it('rejects wrong roles, duplicates, unknown heroes, and a filled own slot', () => {
    const match = input(); match.allies[0] = 'ana';
    expect(() => validateInput(match, demoSnapshot)).toThrow();
    match.allies = [null, 'genji', 'genji', null, null];
    expect(() => validateInput(match, demoSnapshot)).toThrow(/중복/);
    match.allies = [null, null, null, 'ana', null];
    expect(() => validateInput(match, demoSnapshot)).toThrow(/비워/);
  });
  it('does not invent counter edges or infer their reverse direction', () => {
    const meta = structuredClone(demoSnapshot); meta.matchups = [];
    const match = input(); match.enemies[0] = 'roadhog';
    expect(rankLocally(meta, match).every(c => c.breakdown.counter === 50)).toBe(true);
    expect(rankLocally(meta, match)[0].missing).toContain('일부 상대 상성 근거 없음');
    const ana = rankLocally(demoSnapshot, match).find(c => c.hero.id === 'ana')!;
    expect(ana.breakdown.counter).toBeGreaterThan(50);
  });
  it('treats missing tier as unknown and preserves neutral map score', () => {
    const meta = structuredClone(demoSnapshot); meta.mapFits = [];
    meta.heroes.forEach(h => { h.strength = null; h.tier = 'unknown'; });
    expect(rankLocally(meta, input()).every(c => c.score === 50)).toBe(true);
  });
  it('canonicalizes teammate order and invalidates cache on meta/effort changes', () => {
    const first = input(); first.allies[1] = 'genji'; first.allies[2] = 'tracer';
    const second = input(); second.allies[1] = 'tracer'; second.allies[2] = 'genji';
    const key = recommendationKey('a', first, 'gpt-6-astra', 'low');
    expect(key).toBe(recommendationKey('a', second, 'gpt-6-astra', 'low'));
    expect(key).not.toBe(recommendationKey('b', first, 'gpt-6-astra', 'low'));
    expect(key).not.toBe(recommendationKey('a', first, 'gpt-6-astra', 'medium'));
  });
  it('rejects GPT hallucinated or repeated IDs', () => {
    const candidates = rankLocally(demoSnapshot, input());
    const recommendations = candidates.slice(0, 5).map(c => ({ heroId: c.hero.id, reason: '근거', caution: '' }));
    expect(applyRanking(candidates, { recommendations })).toHaveLength(5);
    recommendations[0].heroId = 'not-a-hero';
    expect(() => applyRanking(candidates, { recommendations })).toThrow();
    recommendations[0].heroId = recommendations[1].heroId;
    expect(() => applyRanking(candidates, { recommendations })).toThrow();
  });
  it('rejects malformed relationships and unsupported live claims', () => {
    const meta = structuredClone(demoSnapshot); meta.mapFits[0].heroId = 'unknown';
    expect(() => validateSnapshot(meta)).toThrow();
    expect(() => validateSnapshot({ ...demoSnapshot, kind: 'live' })).toThrow(/출처/);
  });
});

describe('persistence and local API', () => {
  let directory: string;
  let store: Store;
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'ow-tool-test-')); store = new Store(directory, demoSnapshot); await store.initialize(); });
  afterEach(async () => {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + '\\ow-tool-test-') && !resolve(directory).startsWith(resolve(tmpdir()) + '/ow-tool-test-')) throw new Error('Unsafe test cleanup');
    await rm(directory, { recursive: true });
  });
  it('persists recommendation settings across restarts', async () => {
    await store.saveSettings({ ...defaultSettings, rankingEffort: 'medium' });
    const restarted = new Store(directory, demoSnapshot); await restarted.initialize();
    expect(restarted.getSettings().rankingEffort).toBe('medium');
  });
  it('preserves an existing snapshot when new data fails validation', async () => {
    await store.saveSnapshot(demoSnapshot);
    expect(() => store.saveSnapshot({ ...demoSnapshot, heroes: [] })).toThrow();
    const restarted = new Store(directory, demoSnapshot); await restarted.initialize();
    expect(restarted.getSnapshot().id).toBe('demo-v1');
  });
  it('returns five local demo picks without making paid calls', async () => {
    const response = await request(createApp(store)).post('/api/recommend').set('X-OW-Tool', '1').send(input());
    expect(response.status).toBe(200);
    expect(response.body.mode).toBe('local');
    expect(response.body.candidates).toHaveLength(5);
    expect(response.body.warning).toContain('체험용');
  });
  it('rejects cross-site mutations and wrong-role input', async () => {
    const app = createApp(store);
    expect((await request(app).put('/api/settings').send(defaultSettings)).status).toBe(403);
    expect((await request(app).post('/api/recommend').set('X-OW-Tool', '1').send({ ...input(), role: 'tank' })).status).toBe(400);
  });
  it('does not expose the API key in the state response', async () => {
    const response = await request(createApp(store)).get('/api/state');
    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('apiKey');
    expect(response.body.settings).not.toHaveProperty('apiKey');
  });
});
