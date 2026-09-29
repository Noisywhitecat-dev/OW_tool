import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { actualRank, heroCatalogSchema, mapCatalogSchema, statRowsSchema, validateStatistics, type Statistics } from '../shared/statistics';

const BASE = 'https://overfast-api.tekrop.fr';
const modes = new Set(['escort', 'hybrid', 'control', 'push', 'flashpoint', 'clash']);
const envelopeSchema = z.object({ url: z.string(), fetchedAt: z.iso.datetime(), upstreamAgeSeconds: z.number().nonnegative().nullable(), cacheControl: z.string().nullable(), upstreamCacheStatus: z.string().nullable(), data: z.unknown() });
export class SourceError extends Error {}
class UnsupportedMap extends Error {}
export class OverFast {
  private nextRequestAt = 0;
  constructor(private directory: string, private request: typeof fetch = fetch, private pause: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)), private now = () => Date.now()) {}
  private async get<T>(route: string, schema: z.ZodType<T>, ttl: number) {
    const url = BASE + route;
    await mkdir(this.directory, { recursive: true });
    const file = join(this.directory, createHash('sha256').update(url).digest('hex') + '.json');
    try {
      const cached = envelopeSchema.parse(JSON.parse(await readFile(file, 'utf8')));
      const age = this.now() - Date.parse(cached.fetchedAt);
      if (cached.url === url && age >= 0 && age < ttl) return { ...cached, data: schema.parse(cached.data) };
    } catch { /* A missing, corrupt or obsolete cache is replaced only after a valid response. */ }
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.pause(Math.max(0, this.nextRequestAt - this.now()));
      this.nextRequestAt = this.now() + 350;
      let response: Response;
      try { response = await this.request(url, { signal: AbortSignal.timeout(20_000) }); }
      catch { throw new SourceError('공개 통계 서버에 연결하지 못했습니다. 기존 메타는 유지됩니다.'); }
      if ([429, 503].includes(response.status)) {
        const retry = response.headers.get('retry-after');
        const delay = retry === null ? 1000 * 2 ** attempt : /^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - this.now();
        if (attempt === 2 || !Number.isFinite(delay) || delay > 30_000) throw new SourceError('공개 통계 서버가 혼잡합니다. 잠시 후 다시 시도해 주세요. 기존 메타는 유지됩니다.');
        await this.pause(Math.max(0, delay)); continue;
      }
      if (response.status === 400 && new URL(url).searchParams.has('map')) {
        const error = await response.json().catch(() => null) as { error?: string } | null;
        const map = new URL(url).searchParams.get('map');
        if (error?.error === `Selected map '${map}' is not compatible with 'competitive' gamemode.`) throw new UnsupportedMap();
      }
      if (!response.ok) throw new SourceError(`공개 통계 조회 실패(HTTP ${response.status}). 기존 메타는 유지됩니다.`);
      let data: T;
      try { data = schema.parse(await response.json()); }
      catch { throw new SourceError('공개 통계 형식이 변경되었거나 유효하지 않습니다. 기존 메타는 유지됩니다.'); }
      const age = response.headers.get('age');
      const envelope = { url, fetchedAt: new Date(this.now()).toISOString(), upstreamAgeSeconds: age !== null && /^\d+$/.test(age) ? Number(age) : null,
        cacheControl: response.headers.get('cache-control'), upstreamCacheStatus: response.headers.get('x-cache-status'), data };
      const temporary = file + '.' + randomUUID() + '.tmp';
      await writeFile(temporary, JSON.stringify(envelope), 'utf8'); await rename(temporary, file);
      return envelope;
    }
    throw new SourceError('공개 통계 조회 실패');
  }
  async collect(rank: Statistics['requestedRank'], progress: (text: string) => void = () => {}) {
    const query = new URLSearchParams({ platform: 'pc', gamemode: 'competitive', region: 'asia' });
    if (actualRank(rank) !== 'all') query.set('competitive_division', actualRank(rank));
    progress('공개 영웅·맵 목록과 아시아 경쟁전 통계를 확인하고 있습니다.');
    const heroes = await this.get('/heroes?locale=ko-kr&gamemode=quickplay', heroCatalogSchema, 86400_000);
    const maps = await this.get('/maps', mapCatalogSchema, 86400_000);
    const overall = await this.get('/heroes/stats?' + query, statRowsSchema.min(1), 3600_000);
    const candidates = maps.data.filter(m => m.gamemodes.some(mode => modes.has(mode)));
    if (!candidates.length || candidates.length > 100) throw new SourceError('경쟁전 지원 모드의 맵 목록을 확인할 수 없습니다.');
    const byMap: Statistics['byMap'] = [];
    const unavailableMaps: Statistics['unavailableMaps'] = [];
    for (const [index, map] of candidates.entries()) {
      progress(`맵별 공개 통계 수집 중 (${index + 1}/${candidates.length}) · ${map.name}`);
      const params = new URLSearchParams(query); params.set('map', map.key);
      try { byMap.push({ mapId: map.key, ...await this.get('/heroes/stats?' + params, statRowsSchema, 3600_000) }); }
      catch (error) { if (error instanceof UnsupportedMap) unavailableMaps.push({ mapId: map.key, reason: 'not-compatible-with-competitive' }); else throw error; }
    }
    return validateStatistics({ provider: 'overfast', requestedRegion: 'KR', region: 'asia', platform: 'pc', gamemode: 'competitive', requestedRank: rank,
      actualRank: actualRank(rank), collectedAt: new Date(this.now()).toISOString(), heroes, maps, overall, byMap, unavailableMaps });
  }
}
