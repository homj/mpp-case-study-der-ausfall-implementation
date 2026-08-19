import { describe, expect, it } from 'vitest';
import { rankTasks } from './priority.js';

interface Item {
  id: string;
  earliestStartsAt: Date;
  warningCount: number;
  phoneContactable: boolean;
  pinned?: boolean;
}

function item(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id,
    earliestStartsAt: new Date('2026-09-07T08:00:00Z'),
    warningCount: 0,
    phoneContactable: true,
    ...overrides,
  };
}

describe('rankTasks', () => {
  it('puts pinned items first, whatever else they look like', () => {
    const pinned = item('pinned', {
      earliestStartsAt: new Date('2026-09-09T08:00:00Z'),
      pinned: true,
    });
    const early = item('early', { earliestStartsAt: new Date('2026-09-07T06:00:00Z') });
    expect(rankTasks([early, pinned]).map((i) => i.id)).toEqual(['pinned', 'early']);
  });

  it('sorts by earliest start ascending', () => {
    const late = item('late', { earliestStartsAt: new Date('2026-09-07T09:00:00Z') });
    const soon = item('soon', { earliestStartsAt: new Date('2026-09-07T06:00:00Z') });
    expect(rankTasks([late, soon]).map((i) => i.id)).toEqual(['soon', 'late']);
  });

  it('breaks a tie on start time with the higher warning count', () => {
    const risky = item('risky', { warningCount: 3 });
    const calm = item('calm', { warningCount: 1 });
    expect(rankTasks([calm, risky]).map((i) => i.id)).toEqual(['risky', 'calm']);
  });

  it('breaks a remaining tie in favour of patients we can phone', () => {
    const reachable = item('reachable', { phoneContactable: true });
    const unreachable = item('unreachable', { phoneContactable: false });
    expect(rankTasks([unreachable, reachable]).map((i) => i.id)).toEqual([
      'reachable',
      'unreachable',
    ]);
  });

  it('does not mutate the input array', () => {
    const items = [item('b', { earliestStartsAt: new Date('2026-09-07T09:00:00Z') }), item('a')];
    const ranked = rankTasks(items);
    expect(items.map((i) => i.id)).toEqual(['b', 'a']);
    expect(ranked.map((i) => i.id)).toEqual(['a', 'b']);
  });
});
