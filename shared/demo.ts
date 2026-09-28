import { validateSnapshot, type Hero, type Role, type Snapshot } from './schema';

// Deliberately illustrative fixtures, never a claim about the current season.
const roster: [string, string, Role, 'dive' | 'brawl' | 'poke'][] = [
  ['dva', 'D.Va', 'tank', 'dive'], ['doomfist', '둠피스트', 'tank', 'dive'],
  ['junker-queen', '정커퀸', 'tank', 'brawl'], ['mauga', '마우가', 'tank', 'brawl'],
  ['orisa', '오리사', 'tank', 'brawl'], ['ramattra', '라마트라', 'tank', 'brawl'],
  ['reinhardt', '라인하르트', 'tank', 'brawl'], ['roadhog', '로드호그', 'tank', 'brawl'],
  ['sigma', '시그마', 'tank', 'poke'], ['winston', '윈스턴', 'tank', 'dive'],
  ['wrecking-ball', '레킹볼', 'tank', 'dive'], ['zarya', '자리야', 'tank', 'brawl'],
  ['hazard', '해저드', 'tank', 'dive'],
  ['ashe', '애쉬', 'damage', 'poke'], ['bastion', '바스티온', 'damage', 'poke'],
  ['cassidy', '캐서디', 'damage', 'brawl'], ['echo', '에코', 'damage', 'dive'],
  ['genji', '겐지', 'damage', 'dive'], ['hanzo', '한조', 'damage', 'poke'],
  ['junkrat', '정크랫', 'damage', 'brawl'], ['mei', '메이', 'damage', 'brawl'],
  ['pharah', '파라', 'damage', 'poke'], ['reaper', '리퍼', 'damage', 'brawl'],
  ['sojourn', '소전', 'damage', 'poke'], ['soldier-76', '솔저: 76', 'damage', 'poke'],
  ['sombra', '솜브라', 'damage', 'dive'], ['symmetra', '시메트라', 'damage', 'brawl'],
  ['torbjorn', '토르비욘', 'damage', 'poke'], ['tracer', '트레이서', 'damage', 'dive'],
  ['venture', '벤처', 'damage', 'dive'], ['widowmaker', '위도우메이커', 'damage', 'poke'],
  ['ana', '아나', 'support', 'poke'], ['baptiste', '바티스트', 'support', 'brawl'],
  ['brigitte', '브리기테', 'support', 'brawl'], ['illari', '일리아리', 'support', 'poke'],
  ['juno', '주노', 'support', 'dive'], ['kiriko', '키리코', 'support', 'dive'],
  ['lifeweaver', '라이프위버', 'support', 'poke'], ['lucio', '루시우', 'support', 'brawl'],
  ['mercy', '메르시', 'support', 'poke'], ['moira', '모이라', 'support', 'brawl'],
  ['zenyatta', '젠야타', 'support', 'poke'],
];
const heroes: Hero[] = roster.map(([id, name, role, style], i) => ({
  id, name, role, archetypes: [style], tier: (['A', 'B', 'S', 'A'] as const)[i % 4],
  strength: [76, 62, 91, 80][i % 4], reason: '동작 확인용 예시 평가입니다. 현재 시즌의 티어가 아닙니다.', sourceIds: [],
}));
const maps: Snapshot['maps'] = [
  { id: 'kings-row', name: '왕의 길', mode: '혼합', tags: ['좁은 길목', '근접 교전'], description: '런던의 좁은 길목과 굽이진 화물 경로' },
  { id: 'watchpoint-gibraltar', name: '감시 기지: 지브롤터', mode: '호위', tags: ['고지대', '수직 이동'], description: '여러 층의 고지대를 오가는 화물 경로' },
  { id: 'circuit-royal', name: '서킷 로얄', mode: '호위', tags: ['긴 시야', '원거리 교전'], description: '긴 직선 시야와 높은 수비 지형' },
  { id: 'ilios', name: '일리오스', mode: '쟁탈', tags: ['환경 처치', '거점 교전'], description: '거점마다 다른 지형을 가진 쟁탈 전장' },
  { id: 'lijiang-tower', name: '리장 타워', mode: '쟁탈', tags: ['좁은 길목', '거점 교전'], description: '거점 진입로와 실내외 교전이 이어지는 전장' },
  { id: 'numbani', name: '눔바니', mode: '혼합', tags: ['고지대', '우회로'], description: '고지대 진입과 우회 경로가 있는 도시 전장' },
  { id: 'esperanca', name: '이스페란사', mode: '밀기', tags: ['우회로', '재합류'], description: '로봇을 따라 교전 위치가 바뀌는 밀기 전장' },
  { id: 'new-junk-city', name: '뉴 정크 시티', mode: '플래시포인트', tags: ['거점 이동', '근접 교전'], description: '거점 사이 이동과 합류가 반복되는 전장' },
];
const styles = ['brawl', 'dive', 'poke', 'brawl', 'brawl', 'dive', 'dive', 'brawl'];
export const demoSnapshot = validateSnapshot({
  id: 'demo-v1', schemaVersion: 1, kind: 'demo', createdAt: '2026-01-01T00:00:00.000Z',
  patch: '체험용 데이터 · 실제 메타 아님', patchDate: '2026-01-01',
  scope: { platform: 'PC', queue: '5v5-role', rank: 'all' },
  summary: '화면과 추천 흐름을 체험하는 예시입니다. 실제 시즌의 티어·상성을 나타내지 않습니다.',
  heroes, maps,
  mapFits: maps.flatMap((map, i) => heroes.map(hero => ({ heroId: hero.id, mapId: map.id, score: hero.archetypes.includes(styles[i] as Hero['archetypes'][number]) ? .7 : .05, reason: `예시: ${map.name}에서 ${hero.archetypes[0]} 성향의 적합도`, sourceIds: [] }))),
  matchups: [
    { heroId: 'ana', opponentId: 'roadhog', score: .7, reason: '예시: 회복을 방해하는 수단의 가치', sourceIds: [] },
    { heroId: 'reaper', opponentId: 'winston', score: .6, reason: '예시: 근거리에서 진입한 탱커 대응', sourceIds: [] },
    { heroId: 'dva', opponentId: 'ashe', score: .5, reason: '예시: 고지대 딜러에게 접근하는 가치', sourceIds: [] },
  ],
  synergies: [
    { heroId: 'reinhardt', allyId: 'lucio', score: .8, reason: '예시: 근접 교전을 위한 진입 지원', sourceIds: [] },
    { heroId: 'winston', allyId: 'tracer', score: .8, reason: '예시: 같은 표적에 함께 진입하는 조합', sourceIds: [] },
    { heroId: 'ana', allyId: 'genji', score: .7, reason: '예시: 공격 기회를 지원하는 궁극기 연계', sourceIds: [] },
  ],
  sources: [], limitations: ['최신 영웅·맵 전체 목록이 아닙니다. 메타 갱신 시 조사된 목록으로 교체됩니다.', '점수와 티어는 예시이며 경쟁전 판단에 사용하지 마세요.'],
});
