import { slots, type Hero, type RecommendationInput, type Snapshot } from '../shared/schema';

export type Position = { team: 'allies' | 'enemies'; index: number };
export const blankTeam = () => Array<string | null>(5).fill(null);
export const initialInput = (mapId: string): RecommendationInput => ({ mapId, role: 'tank', side: 'either', ownSlot: 0, allies: blankTeam(), enemies: blankTeam() });
export function positions(input: RecommendationInput): Position[] {
  return (['allies', 'enemies'] as const).flatMap(team => slots.flatMap((_, index) => team === 'allies' && index === input.ownSlot ? [] : [{ team, index }]));
}
export function nextEmpty(input: RecommendationInput, current: Position): Position | null {
  const order = positions(input), start = order.findIndex(p => p.team === current.team && p.index === current.index);
  for (let offset = 1; offset <= order.length; offset++) {
    const position = order[(start + offset) % order.length];
    if (!input[position.team][position.index]) return position;
  }
  return null;
}
const initials = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC').toLowerCase().replace(/[\s.:'’_-]/g, '');
export function matchesHero(hero: Hero, query: string): boolean {
  const value = normalize(query);
  const initialName = [...hero.name].map(char => { const n = char.charCodeAt(0) - 0xac00; return n >= 0 && n < 11172 ? initials[Math.floor(n / 588)] : char; }).join('');
  return [hero.name, hero.id, initialName].some(name => normalize(name).includes(value));
}
// Reconcile a replaced meta file without discarding the current match.
export function reconcileInput(input: RecommendationInput, snapshot: Snapshot): RecommendationInput {
  const clean = (team: 'allies' | 'enemies') => {
    const seen = new Set<string>();
    return input[team].map((id, index) => {
      if (team === 'allies' && index === input.ownSlot) return null;
      if (!id || seen.has(id) || !snapshot.heroes.some(h => h.id === id && h.role === slots[index])) return null;
      seen.add(id); return id;
    });
  };
  return { ...input, mapId: snapshot.maps.some(m => m.id === input.mapId) ? input.mapId : snapshot.maps[0].id, allies: clean('allies'), enemies: clean('enemies') };
}
