"use client";

import { Tabs } from "@/components/ui/Tabs";
import type { Store } from "@/lib/domain/list";
import { formatMoney } from "@/lib/domain/money-input";
import { STORES, STORE_NAMES } from "@/lib/list/prices";

/** Fred Meyer, Amazon and Costco: each shows what you'd spend there and how many things to get. The rows below are its tab panel (id `panelId`). */
export function StoreTabs({
  active,
  onChange,
  byStore,
  panelId,
}: {
  active: Store;
  onChange: (s: Store) => void;
  byStore: Record<Store, { cents: number; count: number }>;
  panelId: string;
}) {
  return (
    <div className="bk-gutter">
      <Tabs
        label="Stores"
        items={STORES.map((s) => ({ id: s, label: STORE_NAMES[s], detail: `${formatMoney(byStore[s].cents)} · ${byStore[s].count}` }))}
        active={active}
        onChange={onChange}
        panelId={panelId}
      />
    </div>
  );
}
