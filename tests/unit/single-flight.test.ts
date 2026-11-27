import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backoffDelay, retryAfter, retryWithBackoff, singleFlight } from "@/lib/list/single-flight";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("singleFlight", () => {
  it("runs one at a time: calls during a run join it and the run repeats once", async () => {
    let active = 0;
    let maxActive = 0;
    const gates: (() => void)[] = [];
    const task = vi.fn(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((r) => gates.push(r));
      active--;
    });
    const f = singleFlight();
    const first = f.run(task);
    await tick();
    const joined = [f.run(task), f.run(task), f.run(task)];
    expect(task).toHaveBeenCalledTimes(1);
    gates[0]();
    await tick();
    expect(task).toHaveBeenCalledTimes(2); // one repeat, however many calls came in
    gates[1]();
    await Promise.all([first, ...joined]);
    expect(task).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
  });

  it("does not discard the first result when a second call arrives during the run", async () => {
    const results: string[] = [];
    let n = 0;
    const f = singleFlight();
    const task = async () => {
      const mine = ++n;
      await new Promise((r) => setTimeout(r, 10));
      results.push(`run${mine}`);
    };
    const p = f.run(task);
    await tick();
    void f.run(task);
    await p;
    expect(results).toEqual(["run1", "run2"]);
  });

  it("join() shares the run in flight without asking for a repeat, and starts one when idle", async () => {
    const task = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    const f = singleFlight();
    await f.join(task);
    expect(task).toHaveBeenCalledTimes(1);
    const p = f.run(task);
    await f.join(task);
    await p;
    expect(task).toHaveBeenCalledTimes(2); // run() + idle join(); the join during the run added none
  });

  it("starts again after a run that threw, and passes the error to the callers of that run", async () => {
    let fail = true;
    const f = singleFlight();
    const task = async () => {
      if (fail) throw new Error("boom");
    };
    await expect(f.run(task)).rejects.toThrow("boom");
    fail = false;
    await expect(f.run(task)).resolves.toBeUndefined();
  });

  it("a 7 s load completes while the retry timer ticks", async () => {
    vi.useFakeTimers();
    try {
      let done = 0;
      const f = singleFlight();
      const task = async () => {
        await new Promise((r) => setTimeout(r, 7000));
        done++;
      };
      void f.run(task);
      const joins: Promise<void>[] = [];
      const timer = setInterval(() => joins.push(f.join(task)), 5000);
      await vi.advanceTimersByTimeAsync(7000);
      clearInterval(timer);
      await Promise.all(joins);
      expect(done).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("acceptance: Check off all (40) on the tapping phone", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("makes at most 2 reloads however many echoes realtime sends", async () => {
    let reloads = 0;
    const flight = singleFlight();
    const task = async () => {
      reloads++;
      await new Promise((r) => setTimeout(r, 300));
    };
    const reload = { run: () => flight.run(task) };
    // The tap reloads once (realtime not live), then 40 echoes arrive while that reload is out.
    const tap = reload.run();
    await vi.advanceTimersByTimeAsync(50);
    for (let i = 0; i < 40; i++) void reload.run();
    await vi.advanceTimersByTimeAsync(2000);
    await tap;
    expect(reloads).toBeLessThanOrEqual(2);
  });
});

describe("backoffDelay", () => {
  it("backs off 5, 10, 20, then 30 s", () => {
    expect([0, 1, 2, 3, 4, 10].map(backoffDelay)).toEqual([5000, 10000, 20000, 30000, 30000, 30000]);
  });
});

describe("retryAfter", () => {
  it("is 0 for a key never asked, and the time left for one that failed", () => {
    expect(retryAfter(undefined, 1000)).toBe(0);
    expect(retryAfter(61_000, 1000)).toBe(60_000);
    expect(retryAfter(61_000, 61_000)).toBe(0);
    expect(retryAfter(61_000, 90_000)).toBe(0);
    expect(retryAfter(Infinity, 90_000)).toBe(Infinity);
  });
});

describe("a tap during a load", () => {
  it("reports a run in flight, and a run() at tap time makes the discarded load repeat once with the new state", async () => {
    const f = singleFlight();
    expect(f.busy()).toBe(false);
    let state = "old";
    const seen: string[] = [];
    const task = async () => {
      const mine = state;
      await new Promise((r) => setTimeout(r, 10));
      seen.push(mine);
    };
    const p = f.run(task);
    await tick();
    expect(f.busy()).toBe(true);
    state = "tapped"; // the tap
    void f.run(task); // what updateMany does when busy
    await p;
    expect(seen).toEqual(["old", "tapped"]);
    expect(f.busy()).toBe(false);
  });
});

describe("retryWithBackoff", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("tries after 5, 10, 20, 30, 30 s until it succeeds, then stops", async () => {
    const times: number[] = [];
    const t0 = Date.now();
    const cancel = retryWithBackoff(async () => {
      times.push(Date.now() - t0);
      return times.length === 6;
    });
    await vi.advanceTimersByTimeAsync(5000 + 10_000 + 20_000 + 30_000 + 30_000 + 30_000 + 60_000);
    expect(times).toEqual([5000, 15_000, 35_000, 65_000, 95_000, 125_000]);
    cancel();
  });
  it("stops when cancelled", async () => {
    const attempt = vi.fn(async () => false);
    const cancel = retryWithBackoff(attempt);
    await vi.advanceTimersByTimeAsync(5000);
    cancel();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
