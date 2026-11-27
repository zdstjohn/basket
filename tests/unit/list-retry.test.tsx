// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ListItem } from "@/lib/domain/list";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/list" }));
vi.mock("@/components/useOfflineShell", () => ({
  useOfflineShell: () => false,
}));

const { item, update } = vi.hoisted(() => {
  const item = (key: string): ListItem => ({
    key,
    canonical: key,
    qty: { kind: "count", amount: 1 } as ListItem["qty"],
    parts: [{ kind: "count", amount: 1 }] as ListItem["parts"],
    role: "produce",
    store: "fred_meyer",
    estimateCents: 100,
    haveIt: false,
    alwaysHave: false,
    outsideBudget: false,
    sources: [],
  });
  return {
    item,
    update: vi.fn<(key: string, patch: unknown) => Promise<void>>(),
  };
});
vi.mock("@/lib/useWeekList", () => {
  const items = [item("onion"), item("beans")];
  const checked = new Set<string>();
  const list = {
    items,
    totals: {
      totalCents: 200,
      missingEstimates: 0,
      byStore: {
        fred_meyer: { cents: 200, count: 2 },
        amazon: { cents: 0, count: 0 },
        costco: { cents: 0, count: 0 },
      },
    },
    loading: false,
    offline: false,
    refusals: 0,
    error: false,
    live: false,
    checked,
    priceSource: {},
    priceDetail: {},
    products: {},
    productMode: false,
    stalePrices: false,
    choices: [],
    update: (k: string, p: unknown) => update(k, p),
    updateMany: vi.fn(),
    reload: vi.fn(),
  };
  return {
    useWeekList: () => list,
    useWeekId: () => ({ id: "w1", failed: false, retry: () => {} }),
    listView: () => "list",
  };
});

import { ListScreen } from "@/components/ListScreen";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  update.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("ListScreen retry", () => {
  it("retries the change that failed, never a newer one", async () => {
    let failFirst!: (e: Error) => void;
    update.mockImplementationOnce(
      () => new Promise<void>((_, rej) => (failFirst = rej)),
    );
    update.mockImplementationOnce(() => new Promise<void>(() => {})); // a newer change, still in flight
    const household = {
      id: "h",
      budget_cents: 10000,
      cushion_cents: 0,
    } as never;
    act(() => root.render(<ListScreen household={household} />));

    const box = (name: string) =>
      host.querySelector<HTMLInputElement>(`input[aria-label="Got ${name}"]`)!;
    await act(async () => box("Onion").click());
    await act(async () => box("Beans").click());
    expect(update.mock.calls.map((c) => c[0])).toEqual(["onion", "beans"]);

    // The older change fails while the newer one is still going: Retry must send the older one again.
    await act(async () => failFirst(new Error("network")));
    const retry = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Retry",
    )!;
    expect(retry).toBeTruthy();
    update.mockResolvedValue();
    await act(async () => retry.click());
    expect(update.mock.calls[2][0]).toBe("onion");
  });
});
