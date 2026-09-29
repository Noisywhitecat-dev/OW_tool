import { recommendationInputSchema, slots, type Candidate, type RecommendationInput, type Snapshot } from './schema';

export function validateInput(value: unknown, meta: Snapshot): RecommendationInput {
  const input = recommendationInputSchema.parse(value);
  if (!meta.maps.some(m => m.id === input.mapId)) throw new Error('알 수 없는 맵입니다.');
  if (slots[input.ownSlot] !== input.role) throw new Error('내 슬롯과 역할이 다릅니다.');
  if (input.allies[input.ownSlot] !== null) throw new Error('내 자리는 비워 두세요.');
  for (const team of [input.allies, input.enemies]) {
    const selected = team.filter((v): v is string => v !== null);
    if (new Set(selected).size !== selected.length) throw new Error('한 팀에 같은 영웅을 중복 선택할 수 없습니다.');
    team.forEach((heroId, index) => {
      if (heroId && !meta.heroes.some(h => h.id === heroId && h.role === slots[index])) throw new Error('슬롯에 맞는 영웅을 선택해 주세요.');
    });
  }
  return input;
}

const toScore = (value: number) => 50 + value * 50;
export function rankLocally(meta: Snapshot, raw: RecommendationInput): Candidate[] {
  const input = validateInput(raw, meta);
  const allies = input.allies.filter((v): v is string => Boolean(v));
  const enemies = input.enemies.filter((v): v is string => Boolean(v));
  const strength = (heroId: string) => meta.heroes.find(h => h.id === heroId)?.strength ?? 50;
  return meta.heroes.filter(h => h.role === input.role && !allies.includes(h.id)).map(hero => {
    const fit = meta.mapFits.find(e => e.heroId === hero.id && e.mapId === input.mapId);
    const counters = enemies.map(opponentId => ({
      evidence: meta.matchups.find(e => e.heroId === hero.id && e.opponentId === opponentId),
      weight: 0.5 + strength(opponentId) / 100,
    }));
    const synergies = allies.map(allyId => ({
      evidence: meta.synergies.find(e => (e.heroId === hero.id && e.allyId === allyId) || (e.allyId === hero.id && e.heroId === allyId)),
      weight: 0.5 + strength(allyId) / 100,
    }));
    // Missing edges contribute neutral evidence, not a fabricated counter relationship.
    const average = (rows: { evidence: { score: number } | undefined; weight: number }[]) => rows.length ? toScore(rows.reduce((sum, r) => sum + (r.evidence?.score ?? 0) * r.weight, 0) / rows.reduce((sum, r) => sum + r.weight, 0)) : 50;
    const breakdown = { meta: hero.strength ?? 50, map: toScore(fit?.score ?? 0), counter: average(counters), synergy: average(synergies) };
    const score = Math.round((breakdown.meta * .3 + breakdown.map * .25 + breakdown.counter * .25 + breakdown.synergy * .2) * 10) / 10;
    const evidence = [fit, ...counters.map(r => r.evidence), ...synergies.map(r => r.evidence)].filter(e => e !== undefined);
    const missing = [
      ...(hero.strength === null ? ['현재 티어 근거 없음'] : []),
      ...(!fit ? ['맵 적합도 근거 없음'] : []),
      ...(counters.some(r => !r.evidence) ? ['일부 상대 상성 근거 없음'] : []),
      ...(synergies.some(r => !r.evidence) ? ['일부 아군 시너지 근거 없음'] : []),
    ];
    return { hero, score, breakdown, reasons: [hero.reason, ...evidence.map(e => e.reason)].filter(Boolean), missing,
      sourceIds: [...new Set([...hero.sourceIds, ...evidence.flatMap(e => e.sourceIds)])],
      caution: missing.length ? missing.join(' · ') : '실제 교전, 궁극기 상황과 숙련도에 따라 달라집니다.',
    };
  }).sort((a, b) => b.score - a.score || a.hero.id.localeCompare(b.hero.id));
}

export function recommendationKey(snapshotId: string, input: RecommendationInput, model: string, effort: string): string {
  return JSON.stringify([snapshotId, input.mapId, input.role, input.side, [...input.allies].sort(), [...input.enemies].sort(), model, effort]);
}
