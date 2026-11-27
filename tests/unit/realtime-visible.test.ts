import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const channel = { on: vi.fn(), subscribe: vi.fn() };
channel.on.mockReturnValue(channel);
vi.mock("@/lib/db/client", () => ({ createBrowserClient: () => ({ channel: () => channel, removeChannel: vi.fn() }) }));

import { subscribeHousehold } from "@/lib/realtime";

describe("subscribeHousehold on a returning phone", () => {
  let visible: () => void = () => {};
  let status: (s: string) => void = () => {};
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-26T12:00:00Z"));
    channel.subscribe.mockImplementation((cb: (s: string) => void) => void (status = cb));
    vi.stubGlobal("document", {
      visibilityState: "visible",
      addEventListener: (n: string, f: () => void) => void (n === "visibilitychange" && (visible = f)),
      removeEventListener: () => {},
    });
    vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("ignores a visibilitychange within 2 s of the last refetch, and still refetches on connect", () => {
    const onChange = vi.fn();
    subscribeHousehold("h1", ["week_meals"], onChange);
    status("SUBSCRIBED");
    vi.advanceTimersByTime(200);
    expect(onChange).toHaveBeenCalledTimes(1); // the refetch on SUBSCRIBED stays
    visible();
    vi.advanceTimersByTime(200);
    expect(onChange).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    visible();
    vi.advanceTimersByTime(200);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
