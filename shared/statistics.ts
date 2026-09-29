import { z } from 'zod';

export const rankSchema = z.enum(['all', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond', 'master', 'grandmaster', 'champion']);
export const heroCatalogSchema = z.array(z.object({ key: z.string().min(1), name: z.string().min(1), role: z.enum(['tank', 'damage', 'support']), gamemodes: z.array(z.string()) }).passthrough()).min(1);
export const mapCatalogSchema = z.array(z.object({ key: z.string().min(1), name: z.string().min(1), gamemodes: z.array(z.string()) }).passthrough()).min(1);
const percent = z.number().min(0).max(100);
export const statRowsSchema = z.array(z.object({ hero: z.string().min(1), pickrate: percent, winrate: percent, banrate: percent.nullable().optional() }).passthrough());
export type StatRow = z.infer<typeof statRowsSchema>[number];
const provenanceSchema = z.object({
  url: z.url(), fetchedAt: z.iso.datetime(), upstreamAgeSeconds: z.number().nonnegative().nullable(),
  cacheControl: z.string().nullable(), upstreamCacheStatus: z.string().nullable(),
});
export const statisticsSchema = z.object({
  provider: z.literal('overfast'), requestedRegion: z.literal('KR'), region: z.literal('asia'),
  platform: z.literal('pc'), gamemode: z.literal('competitive'), requestedRank: rankSchema,
  actualRank: z.enum(['all', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond', 'master', 'grandmaster']),
  collectedAt: z.iso.datetime(),
  heroes: provenanceSchema.extend({ data: heroCatalogSchema }),
  maps: provenanceSchema.extend({ data: mapCatalogSchema }),
  overall: provenanceSchema.extend({ data: statRowsSchema.min(1) }),
  byMap: z.array(provenanceSchema.extend({ mapId: z.string(), data: statRowsSchema })),
  unavailableMaps: z.array(z.object({ mapId: z.string(), reason: z.literal('not-compatible-with-competitive') })).default([]),
});
export type Statistics = z.infer<typeof statisticsSchema>;
export const STATISTICS_LIMITATIONS = [
  'KR 전용 자료가 아닌 아시아 역할 고정 경쟁전 대체 통계입니다. 특정 서비스/서버 전용 자료가 아닙니다.',
  '그랜드마스터 통계에는 챔피언이 포함됩니다. 챔피언만의 통계는 제공되지 않습니다.',
  '공식 FAQ는 최근 패치 시작 이후 집계·최대 하루 반영 지연을 안내합니다. API 응답에는 표본 수·정확한 집계 시작/종료·패치 ID가 없으며 조회 시각은 패치 적용 시각이 아닙니다.',
  '0%에는 원천 결측값이 섞일 수 있습니다. 0%를 확정적인 최하위 성능으로 해석하지 않습니다.',
  '전체 맵 목록에는 스타디움 전장도 섞여 있습니다. API 미지원만으로 실제 경쟁전 제외를 단정하지 않습니다. 영웅 쌍별 상성·시너지 통계는 없습니다.',
];
export const actualRank = (rank: Statistics['requestedRank']): Statistics['actualRank'] => rank === 'champion' ? 'grandmaster' : rank;
export function validateStatistics(value: unknown): Statistics {
  const data = statisticsSchema.parse(value);
  if (data.actualRank !== actualRank(data.requestedRank)) throw new Error('통계 티어 범위 불일치');
  const unique = (ids: string[]) => { if (new Set(ids).size !== ids.length) throw new Error('중복 통계 식별자'); };
  unique(data.heroes.data.map(h => h.key)); unique(data.maps.data.map(m => m.key)); unique(data.byMap.map(m => m.mapId));
  const heroes = new Set(data.heroes.data.map(h => h.key)), maps = new Set(data.maps.data.map(m => m.key));
  for (const source of [data.heroes, data.maps, data.overall, ...data.byMap]) {
    const url = new URL(source.url);
    if (url.origin !== 'https://overfast-api.tekrop.fr') throw new Error('통계 출처 불일치');
  }
  for (const source of [data.overall, ...data.byMap]) {
    unique(source.data.map(r => r.hero));
    if (source.data.some(r => !heroes.has(r.hero))) throw new Error('알 수 없는 통계 영웅');
    const url = new URL(source.url);
    if (url.pathname !== '/heroes/stats' || url.searchParams.get('platform') !== 'pc' || url.searchParams.get('gamemode') !== 'competitive' || url.searchParams.get('region') !== 'asia' || (url.searchParams.get('competitive_division') ?? 'all') !== data.actualRank) throw new Error('통계 요청 범위 불일치');
  }
  for (const source of data.byMap) if (!maps.has(source.mapId) || new URL(source.url).searchParams.get('map') !== source.mapId) throw new Error('알 수 없는 통계 맵');
  unique(data.unavailableMaps.map(m => m.mapId));
  if (data.unavailableMaps.some(m => !maps.has(m.mapId) || data.byMap.some(s => s.mapId === m.mapId))) throw new Error('제외 맵 범위 불일치');
  return data;
}

export function statisticsForPrompt(data: Statistics) {
  const compact = (rows: StatRow[]) => rows.map(r => [r.hero, r.winrate === 0 ? null : r.winrate, r.pickrate === 0 ? null : r.pickrate, r.banrate === 0 ? null : r.banrate ?? null]);
  return { region: data.region, requestedRank: data.requestedRank, actualRank: data.actualRank,
    limitations: STATISTICS_LIMITATIONS, columns: ['hero', 'winrate', 'pickrate', 'banrate'],
    heroes: data.heroes.data.map(h => ({ id: h.key, name: h.name, role: h.role })),
    maps: data.byMap.map(m => ({ id: m.mapId, name: data.maps.data.find(x => x.key === m.mapId)!.name })),
    overall: { url: data.overall.url, fetchedAt: data.overall.fetchedAt, rows: compact(data.overall.data) },
    byMap: data.byMap.map(m => ({ id: m.mapId, url: m.url, fetchedAt: m.fetchedAt, rows: compact(m.data) })) };
}
