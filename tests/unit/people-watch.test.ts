import { describe, expect, it } from 'vitest';
import { watchPeople } from '@/lib/people-watch';
import type { Person } from '@/lib/domain/types';
import { familyOfFive } from '@/lib/fixtures/household';

const tick = () => new Promise((r) => setTimeout(r, 0));

function setup(loads: (() => Promise<Person[]>)[]) {
  const state = { people: null as Person[] | null, failed: false };
  let live: () => void = () => {};
  let stopped = false;
  const watch = watchPeople({
    load: () => (loads.shift() as () => Promise<Person[]>)(),
    subscribe: (cb) => {
      live = cb;
      return () => { stopped = true; };
    },
    onPeople: (p) => { state.people = p; },
    onFailed: (f) => { state.failed = f; },
  });
  return { state, watch, fire: () => live(), stopped: () => stopped };
}

describe('watching who is in the household', () => {
  it('clears "Couldn’t check allergies" when a live refetch succeeds after the first load failed', async () => {
    const t = setup([() => Promise.reject(new Error('offline')), () => Promise.resolve(familyOfFive)]);
    await tick();
    expect(t.state).toEqual({ people: null, failed: true });
    t.fire();
    await tick();
    expect(t.state).toEqual({ people: familyOfFive, failed: false });
  });
  it('keeps the message when the live refetch fails too, and Retry loads again', async () => {
    const t = setup([() => Promise.reject(new Error('a')), () => Promise.reject(new Error('b')), () => Promise.resolve(familyOfFive)]);
    await tick();
    t.fire();
    await tick();
    expect(t.state.failed).toBe(true);
    t.watch.retry();
    await tick();
    expect(t.state).toEqual({ people: familyOfFive, failed: false });
  });
  it('stops listening', () => {
    const t = setup([() => Promise.resolve(familyOfFive)]);
    t.watch.stop();
    expect(t.stopped()).toBe(true);
  });
});
