/** Codex-reviewed starting point. Never labels the statistical proxy as measured matchup win rate. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { validateStatistics, STATISTICS_LIMITATIONS } from '../shared/statistics';
import { validateSnapshot, type Snapshot } from '../shared/schema';

const input = process.argv[2]; if (!input) throw new Error('Usage: tsx scripts/prepare-meta.ts statistics.json output.json');
const statistics = validateStatistics(JSON.parse(await readFile(input, 'utf8')));
const output = resolve(process.argv[3] ?? 'meta/current.json');
const korean: Record<string, string> = { aatlis: '아틀리스', 'neon-junction': '네온 교차로', 'antarctic-peninsula': '남극 반도', 'blizzard-world': '블리자드 월드', busan: '부산', 'circuit-royal': '서킷 로얄', colosseo: '콜로세오', dorado: '도라도', eichenwalde: '아이헨발데', esperanca: '이스페란사', havana: '하바나', hollywood: '할리우드', ilios: '일리오스', junkertown: '쓰레기촌', 'lijiang-tower': '리장 타워', 'kings-row': '왕의 길', midtown: '미드타운', nepal: '네팔', 'new-junk-city': '뉴 정크 시티', 'new-queen-street': '뉴 퀸 스트리트', numbani: '눔바니', oasis: '오아시스', paraiso: '파라이수', rialto: '리알토', 'route-66': '66번 국도', runasapi: '루나사피', samoa: '사모아', 'shambali-monastery': '샴발리 수도원', suravasa: '수라바사', 'watchpoint-gibraltar': '감시 기지: 지브롤터' };
const modeNames: Record<string,string> = { escort: '호위', hybrid: '혼합', control: '쟁탈', push: '밀기', flashpoint: '플래시포인트', clash: '격돌' };
const source = (id: string, title: string, url: string) => ({ id, title, url, publishedAt: null });
const abilityIds = ['ana','kiriko','reinhardt','lucio','genji','zarya','reaper','roadhog','winston','dva'];
const sources = [source('official-rates', 'Blizzard · 공식 경쟁전 전장 필터 및 통계 FAQ', 'https://overwatch.blizzard.com/ko-kr/rates/'),source('stats', 'OverFast · 아시아 역할 고정 경쟁전 원본 통계', statistics.overall.url), source('patch', 'Blizzard · 2026-09-23 한국어 패치 노트 확인', 'https://overwatch.blizzard.com/ko-kr/news/patch-notes/'), source('heroes', 'OverFast · 한국어 영웅 목록', statistics.heroes.url),
  ...statistics.byMap.map(m => source('map-'+m.mapId, 'OverFast · '+m.mapId+' 원본 통계', m.url)),
  ...abilityIds.map(id => source('kit-'+id, 'Blizzard 능력 설명을 제공하는 OverFast · '+id, `https://overfast-api.tekrop.fr/heroes/${id}?locale=ko-kr`))];
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const round = (v: number) => Math.round(v * 10) / 10;
const heroes: Snapshot['heroes'] = statistics.heroes.data.map(h => {
  const row = statistics.overall.data.find(r => r.hero === h.key);
  const strength = row && row.winrate > 0 && row.pickrate > 0 ? round(clamp(50 + (row.winrate - 50) * 5, 0, 100)) : null;
  return { id: h.key, name: h.name, role: h.role, archetypes: [], strength,
    tier: strength === null ? 'unknown' : strength >= 70 ? 'S' : strength >= 55 ? 'A' : strength >= 40 ? 'B' : 'C',
    reason: row ? `아시아 ${statistics.requestedRank} 통계: 승률 ${row.winrate}%, 픽률 ${row.pickrate}%. 등급은 승률 기반 임시 비교치이며 표본 수·패치별 집계는 미제공입니다.${h.key === 'dmon' ? ' 9월 18일 한국어 패치의 하향이 집계에 반영됐는지 확인할 수 없습니다.' : ''}` : '해당 범위의 통계가 없습니다.',
    sourceIds: ['stats','heroes', ...(h.key === 'dmon' ? ['patch'] : [])] };
});
const maps: Snapshot['maps'] = statistics.byMap.map(m => { const raw = statistics.maps.data.find(r => r.key === m.mapId)!; return { id: m.mapId, name: korean[m.mapId] ?? raw.name, mode: raw.gamemodes.map(m => modeNames[m] ?? m).join(' / '), tags: ['통계 제공 전장'], description: '2026-09-29 공식 역할 고정 경쟁전 통계의 전장 목록과 대조했습니다. 일시적 게임 내 비활성화는 별도 확인이 필요합니다.' }; });
const mapFits: Snapshot['mapFits'] = statistics.byMap.flatMap(m => m.data.flatMap(row => {
  const overall = statistics.overall.data.find(r => r.hero === row.hero);
  if (!overall || row.winrate <= 0 || row.pickrate <= 0 || overall.winrate <= 0 || overall.pickrate <= 0) return [];
  const difference = row.winrate - overall.winrate;
  return [{ heroId: row.hero, mapId: m.mapId, score: Math.round(clamp(difference / 10, -1, 1) * 1000) / 1000, reason: `맵 승률 ${row.winrate}% · 전체 ${overall.winrate}%의 차이를 이용한 초기 적합도입니다. 표본·맵 구간·공수 차이는 보정하지 못했습니다.`, sourceIds: ['stats','map-'+m.mapId] }];
}));
const matchup = (heroId: string, opponentId: string, score: number, reason: string) => ({ heroId, opponentId, score, reason: '능력 설명을 바탕으로 한 상황별 분석(상성 승률 아님): '+reason, sourceIds: ['kit-'+heroId,'kit-'+opponentId] });
const synergy = (heroId: string, allyId: string, score: number, reason: string) => ({ heroId, allyId, score, reason: '능력 조합 분석(조합 승률 아님): '+reason, sourceIds: ['kit-'+heroId,'kit-'+allyId] });
const meta = validateSnapshot({ id: 'codex-2026-09-29-'+createHash('sha256').update(JSON.stringify(statistics)).digest('hex').slice(0,10), schemaVersion: 1, kind: 'live', createdAt: new Date().toISOString(),
  patch: '공식 패치 2026-09-23(KR) 확인 · 통계의 패치별 집계는 미확인', patchDate: '2026-09-23', scope: { platform: 'PC', queue: '5v5-role', rank: statistics.requestedRank },
  summary: 'Codex 검토 초기 메타: 공개 통계 기반 임시 등급·맵 적합도와, 능력 설명에 근거한 제한적인 상성·시너지 분석입니다. 확정적인 프로 메타 티어표가 아닙니다.',
  heroes, maps, mapFits, sources, statistics,
  matchups: [matchup('ana','roadhog',.35,'치유 차단은 자가 치유 대응에 유용하지만 수류탄 적중과 상대 방어 수단에 좌우됩니다.'),matchup('kiriko','ana',.25,'정화는 아나의 해로운 효과 대응에 활용할 수 있습니다. 방울의 사용 가능 여부가 중요합니다.'),matchup('dva','ana',.2,'방어 매트릭스로 전방 투사체를 차단할 여지가 있습니다. 각도·자원·상대 조합에 따라 결과가 달라집니다.'),matchup('zarya','genji',.2,'광선은 투사체 튕겨내기와 다른 공격 방식입니다. 에너지와 사거리 확보가 전제됩니다.'),matchup('reaper','winston',.2,'근거리 샷건은 접근한 상대를 압박할 수 있습니다. 점프로 교전을 피하면 이점이 줄어듭니다.')],
  synergies: [synergy('ana','genji',.35,'나노 강화와 용검을 조합할 수 있습니다. 궁극기 보유·사용 순서는 입력되지 않습니다.'),synergy('ana','reinhardt',.25,'원거리 치유·나노 강화로 근접 교전 지속력을 보조할 수 있습니다. 시야 확보가 필요합니다.'),synergy('ana','winston',.25,'원거리 치유와 나노 강화로 진입을 지원할 수 있습니다. 방벽과 시야 단절에 유의합니다.'),synergy('lucio','reinhardt',.35,'이동 속도 증폭으로 근접 교전 진입과 이탈을 보조할 수 있습니다.'),synergy('lucio','reaper',.25,'이동 속도로 샷건 유효 거리까지 접근하거나 이탈하는 선택을 도울 수 있습니다.'),synergy('kiriko','reaper',.25,'정화와 여우길의 공격·이동 속도 강화가 근접 교전을 보조할 수 있습니다.'),synergy('zarya','genji',.25,'아군 방벽으로 진입 중 피해를 완화할 수 있습니다. 방벽 사용 시점에 좌우됩니다.'),synergy('zarya','reaper',.25,'아군 방벽과 적을 모으는 궁극기를 근거리 광역 공격에 연결할 수 있습니다.')],
  limitations: [...STATISTICS_LIMITATIONS, '2026-09-29 공식 경쟁전 통계 전장 30개와 수집 전장 30개의 ID 집합이 일치했습니다. 제외된 7개는 스타디움 전용 5개와 일반 경쟁전에서 제거된 격돌 2개입니다.', '등급은 clamp(50 + (승률 - 50) × 5, 0, 100)로 계산한 초기 지표입니다. 픽률 0 또는 승률 0이면 등급 미확인입니다. 픽률·밴률·숙련도·표본 크기로 보정한 확정 티어가 아닙니다.', '상성 5개·시너지 8개는 능력 설명을 해석한 작은 초기 집합입니다. 확인하지 못한 관계는 만들지 않고 중립 처리합니다.', '능력 설명 자체도 비공식 API의 캐시입니다. 특전·최근 핫픽스·궁극기 상태·맵 구간별 차이는 추가 검토가 필요합니다.'] });
await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(meta, null, 2), 'utf8');
console.log(JSON.stringify({ output, id: meta.id, heroes: meta.heroes.length, maps: meta.maps.length, mapFits: meta.mapFits.length }));
