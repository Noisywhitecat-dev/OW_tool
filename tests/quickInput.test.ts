import { describe, expect, it } from 'vitest';
import { demoSnapshot } from '../shared/demo';
import { rankLocally, validateInput } from '../shared/ranking';
import { initialInput, matchesHero, nextEmpty, positions, reconcileInput } from '../src/quickInput';

describe('quick match input', () => {
  it('advances across teams, skips own and occupied slots, and stops when full', () => {
    const input = initialInput('kings-row');
    input.allies = [null, 'genji', 'tracer', 'ana', 'kiriko'];
    expect(nextEmpty(input, { team: 'allies', index: 4 })).toEqual({ team: 'enemies', index: 0 });
    input.enemies = ['winston', 'genji', 'tracer', 'ana', 'kiriko'];
    expect(nextEmpty(input, { team: 'enemies', index: 4 })).toBeNull();
    input.allies[2] = null;
    expect(nextEmpty(input, { team: 'enemies', index: 4 })).toEqual({ team: 'allies', index: 2 });
    expect(positions(input)).toHaveLength(9);
  });
  it('matches Korean initials, partial names, English IDs and punctuation', () => {
    const hero = demoSnapshot.heroes.find(h => h.id === 'reinhardt')!;
    expect(matchesHero(hero, 'ㄹㅇㅎ')).toBe(true);
    expect(matchesHero(hero, '라인')).toBe(true);
    expect(matchesHero(hero, ' REIN ')).toBe(true);
    expect(matchesHero(hero, 'ana')).toBe(false);
    expect(matchesHero({ ...hero, id: 'dva', name: 'D.Va' }, 'd.va')).toBe(true);
  });
  it('preserves the current lineup and map after settings reload', () => {
    const input = initialInput('kings-row'); input.enemies[0] = 'winston';
    expect(reconcileInput(input, demoSnapshot)).toEqual(input);
  });
  it('removes invalid entries after meta replacement but permits enemy mirrors', () => {
    const input = initialInput('removed-map');
    input.allies = ['winston', 'genji', 'genji', 'ana', 'unknown'];
    input.enemies = ['ana', 'genji', null, 'ana', null];
    const updated = reconcileInput(input, demoSnapshot);
    expect(updated.mapId).toBe(demoSnapshot.maps[0].id);
    expect(updated.allies).toEqual([null, 'genji', null, 'ana', null]);
    expect(updated.enemies).toEqual([null, 'genji', null, 'ana', null]);
    expect(() => validateInput(updated, demoSnapshot)).not.toThrow();
  });
  it('recomputes recommendations after an ally swaps without retaining old exclusions', () => {
    const input = { ...initialInput('kings-row'), role: 'support' as const, ownSlot: 3 };
    input.allies[4] = 'ana';
    expect(rankLocally(demoSnapshot, input).some(c => c.hero.id === 'ana')).toBe(false);
    input.allies[4] = 'kiriko';
    const updated = rankLocally(demoSnapshot, input);
    expect(updated.some(c => c.hero.id === 'ana')).toBe(true);
    expect(updated.some(c => c.hero.id === 'kiriko')).toBe(false);
  });
});
