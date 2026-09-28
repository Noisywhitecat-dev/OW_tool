import { z } from 'zod';

export const roleSchema = z.enum(['tank', 'damage', 'support']);
export type Role = z.infer<typeof roleSchema>;
export const roles: Role[] = ['tank', 'damage', 'support'];
export const roleNames: Record<Role, string> = { tank: '탱커', damage: '딜러', support: '힐러' };
export const slots: Role[] = ['tank', 'damage', 'damage', 'support', 'support'];
const id = z.string().min(1).max(100);
const note = z.string().max(1000);
const evidenceSchema = z.object({ score: z.number().min(-1).max(1), reason: note, sourceIds: z.array(id) });
const scopeSchema = z.object({ platform: z.literal('PC'), queue: z.literal('5v5-role'), rank: z.enum(['all', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'grandmaster', 'champion']) });
export type Scope = z.infer<typeof scopeSchema>;

export const metaContentSchema = z.object({
  patch: z.string().min(1).max(200),
  patchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scope: scopeSchema,
  summary: note,
  heroes: z.array(z.object({
    id, name: z.string().min(1).max(80), role: roleSchema,
    archetypes: z.array(z.enum(['dive', 'brawl', 'poke'])),
    tier: z.enum(['S', 'A', 'B', 'C', 'unknown']),
    strength: z.number().min(0).max(100).nullable(),
    reason: note, sourceIds: z.array(id),
  })).min(15),
  maps: z.array(z.object({ id, name: z.string().min(1).max(100), mode: z.string().min(1).max(80), tags: z.array(z.string().max(80)), description: note })).min(1),
  mapFits: z.array(evidenceSchema.extend({ heroId: id, mapId: id })),
  matchups: z.array(evidenceSchema.extend({ heroId: id, opponentId: id })),
  synergies: z.array(evidenceSchema.extend({ heroId: id, allyId: id })),
  sources: z.array(z.object({ id, title: z.string().min(1).max(300), url: z.url().refine(v => /^https?:\/\//.test(v)), publishedAt: z.string().nullable() })),
  limitations: z.array(note),
});
export const snapshotSchema = metaContentSchema.extend({
  id, schemaVersion: z.literal(1), kind: z.enum(['demo', 'live']), createdAt: z.iso.datetime(),
});
export type MetaContent = z.infer<typeof metaContentSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Hero = Snapshot['heroes'][number];

export function validateSnapshot(value: unknown): Snapshot {
  const meta = snapshotSchema.parse(value);
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length) throw new Error(`${label}: 중복 항목이 있습니다.`);
  };
  unique(meta.heroes.map(h => h.id), '영웅');
  unique(meta.maps.map(m => m.id), '맵');
  unique(meta.sources.map(s => s.id), '출처');
  unique(meta.mapFits.map(e => `${e.heroId}:${e.mapId}`), '맵 적합도');
  unique(meta.matchups.map(e => `${e.heroId}:${e.opponentId}`), '상성');
  unique(meta.synergies.map(e => [e.heroId, e.allyId].sort().join(':')), '시너지');
  const heroes = new Set(meta.heroes.map(h => h.id));
  const maps = new Set(meta.maps.map(m => m.id));
  const sources = new Set(meta.sources.map(s => s.id));
  for (const role of roles) if (meta.heroes.filter(h => h.role === role).length < 5) throw new Error(`${roleNames[role]} 데이터가 5명 미만입니다.`);
  for (const row of [...meta.heroes, ...meta.mapFits, ...meta.matchups, ...meta.synergies]) {
    if (row.sourceIds.some(s => !sources.has(s))) throw new Error('알 수 없는 출처입니다.');
    if (meta.kind === 'live' && row.sourceIds.length === 0 && !('strength' in row && row.strength === null)) throw new Error('메타 수치에 출처가 없습니다.');
  }
  for (const row of meta.mapFits) if (!heroes.has(row.heroId) || !maps.has(row.mapId)) throw new Error('맵 적합도 참조가 잘못되었습니다.');
  for (const row of meta.matchups) if (!heroes.has(row.heroId) || !heroes.has(row.opponentId) || row.heroId === row.opponentId) throw new Error('상성 참조가 잘못되었습니다.');
  for (const row of meta.synergies) if (!heroes.has(row.heroId) || !heroes.has(row.allyId) || row.heroId === row.allyId) throw new Error('시너지 참조가 잘못되었습니다.');
  if (meta.kind === 'live' && !meta.sources.length) throw new Error('검색 출처가 없습니다.');
  return meta;
}

export const settingsSchema = z.object({
  researchModel: z.string().regex(/^[a-zA-Z0-9._-]+$/).max(100),
  researchEffort: z.literal('high'),
  rankingModel: z.string().regex(/^[a-zA-Z0-9._-]+$/).max(100),
  rankingEffort: z.enum(['low', 'medium']),
  scope: scopeSchema,
  researchPrompt: z.string().min(100).max(20000),
});
export type Settings = z.infer<typeof settingsSchema>;
export const recommendationInputSchema = z.object({
  mapId: id, role: roleSchema,
  side: z.enum(['attack', 'defense', 'either']),
  allies: z.array(id.nullable()).length(5),
  enemies: z.array(id.nullable()).length(5),
  ownSlot: z.number().int().min(0).max(4),
});
export type RecommendationInput = z.infer<typeof recommendationInputSchema>;
export const rankingOutputSchema = z.object({ recommendations: z.array(z.object({ heroId: id, reason: z.string().min(1).max(500), caution: z.string().max(500) })).length(5) });

export interface Candidate {
  hero: Hero;
  score: number;
  breakdown: { meta: number; map: number; counter: number; synergy: number };
  reasons: string[];
  missing: string[];
  sourceIds: string[];
  caution: string;
}
export interface RecommendationResult {
  mode: 'local' | 'gpt'; snapshotId: string; candidates: Candidate[];
  cached: boolean; warning: string | null;
}
export interface Job { status: 'idle' | 'running' | 'completed' | 'failed'; message: string; startedAt: string | null }
