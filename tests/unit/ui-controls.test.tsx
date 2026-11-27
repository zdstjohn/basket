// @vitest-environment jsdom
import { act, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Plus } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Segmented } from "@/components/ui/Segmented";
import { RadioRows } from "@/components/ui/RadioRows";
import { ErrorBanner, EmptyState, Loading } from "@/components/ui/states";
import { Toast } from "@/components/ui/Toast";
import { Stepper } from "@/components/ui/Stepper";
import { Check } from "@/components/ui/Check";
import { Switch } from "@/components/ui/Switch";
import { Icon } from "@/components/ui/Icon";
import { LookPicker } from "@/components/LookPicker";
import { LOOK_KEY } from "@/lib/look";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function render(el: ReactElement) {
  act(() => root.render(el));
}
function key(el: Element, k: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  });
}
function click(el: Element) {
  act(() => (el as HTMLElement).click());
}
const q = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T>(sel)!;
const all = (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)];

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  localStorage.clear();
  document.documentElement.removeAttribute("data-look");
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const TABS = [
  { id: "a", label: "Plan", detail: "7 meals" },
  { id: "b", label: "List" },
  { id: "c", label: "Cart" },
];

function TabsHarness() {
  const [v, setV] = useState("a");
  return <Tabs label="Sections" items={TABS} active={v} onChange={setV} panelId="panel" />;
}

describe("Tabs", () => {
  it("moves with arrow keys and only the selected tab is a tab stop", () => {
    render(<TabsHarness />);
    const tabs = () => all('[role="tab"]');
    expect(q('[role="tablist"]').getAttribute("aria-label")).toBe("Sections");
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    expect(tabs()[0].getAttribute("aria-controls")).toBe("panel");
    key(tabs()[0], "ArrowRight");
    expect(tabs().map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
    expect(document.activeElement).toBe(tabs()[1]);
    key(tabs()[1], "ArrowLeft");
    key(tabs()[0], "ArrowLeft");
    expect(tabs()[2].getAttribute("aria-selected")).toBe("true");
  });
  it("names a tab by its label then its detail", () => {
    render(<TabsHarness />);
    expect(all('[role="tab"]')[0].textContent).toBe("Plan7 meals");
  });
});

const SEGS = [
  { id: "x", label: "Most loved" },
  { id: "y", label: "Fits this week" },
];

function SegHarness() {
  const [v, setV] = useState("x");
  return <Segmented label="Order" options={SEGS} value={v} onChange={setV} />;
}

describe("Segmented", () => {
  it("moves with arrow keys and only the chosen one is a tab stop", () => {
    render(<SegHarness />);
    const radios = () => all('[role="radio"]');
    expect(q('[role="radiogroup"]').getAttribute("aria-label")).toBe("Order");
    expect(radios().map((r) => r.tabIndex)).toEqual([0, -1]);
    key(radios()[0], "ArrowRight");
    expect(radios().map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true"]);
    expect(radios().map((r) => r.tabIndex)).toEqual([-1, 0]);
    expect(document.activeElement).toBe(radios()[1]);
    key(radios()[1], "ArrowLeft");
    expect(radios()[0].getAttribute("aria-checked")).toBe("true");
  });
});

describe("RadioRows", () => {
  it("renders native radios sharing one name", () => {
    const onChange = vi.fn();
    render(
      <RadioRows
        label="Pick"
        name="pick"
        options={[
          { value: "1", label: "One", detail: "first" },
          { value: "2", label: "Two" },
        ]}
        value="1"
        onChange={onChange}
      />,
    );
    const radios = all('input[type="radio"]') as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    expect(new Set(radios.map((r) => r.name))).toEqual(new Set(["pick"]));
    expect(radios.map((r) => r.checked)).toEqual([true, false]);
    click(radios[1]);
    expect(onChange).toHaveBeenCalledWith("2");
  });
});

describe("Button", () => {
  it("is disabled while busy and shows its busy label", () => {
    render(
      <Button variant="main" busy busyLabel="Saving…">
        Save
      </Button>,
    );
    const b = q<HTMLButtonElement>("button");
    expect(b.disabled).toBe(true);
    expect(b.textContent).toContain("Saving…");
  });
  it("shows its children and is enabled when not busy", () => {
    render(<Button variant="ghost">Save</Button>);
    const b = q<HTMLButtonElement>("button");
    expect(b.disabled).toBe(false);
    expect(b.textContent).toBe("Save");
  });
});

describe("IconButton", () => {
  it("has the label as its accessible name and calls onClick", () => {
    const onClick = vi.fn();
    render(<IconButton icon={Plus} label="Add a meal" onClick={onClick} />);
    const b = q<HTMLButtonElement>("button");
    expect(b.getAttribute("aria-label")).toBe("Add a meal");
    click(b);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("Icon", () => {
  it("is hidden from the reader unless it has a label", () => {
    render(
      <>
        <Icon icon={Plus} size={18} />
        <Icon icon={Plus} size={24} label="Add" />
      </>,
    );
    const [a, b] = all("svg");
    expect(a.getAttribute("aria-hidden")).toBe("true");
    expect(b.getAttribute("role")).toBe("img");
    expect(b.getAttribute("aria-label")).toBe("Add");
  });
});

describe("states", () => {
  it("ErrorBanner sets curly apostrophes and is an alert", () => {
    render(<ErrorBanner message="We couldn't save." actionLabel="Try again" onAction={() => {}} />);
    expect(q('[role="alert"]').textContent).toContain("couldn’t");
    expect(q("button").textContent).toContain("Try again");
  });
  it("Loading is a status the reader can find", () => {
    render(<Loading label="Loading your list" />);
    expect(q('[role="status"]').textContent).toBe("Loading your list");
  });
  it("EmptyState shows its sentence and action", () => {
    render(<EmptyState sentence="Nothing here yet." action={{ label: "Add one", onAction: () => {} }} />);
    expect(host.textContent).toContain("Nothing here yet.");
    expect(q("button").textContent).toContain("Add one");
  });
});

describe("Toast", () => {
  it("calls onDone after ms and not before, with curly text", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<Toast message="Couldn't undo." tone="bad" ms={3000} onDone={onDone} />);
    expect(q('[role="status"]').textContent).toContain("Couldn’t undo.");
    act(() => vi.advanceTimersByTime(2999));
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalledOnce();
  });
  it("defaults to four seconds", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<Toast message="Saved." tone="ok" onDone={onDone} />);
    act(() => vi.advanceTimersByTime(3999));
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalledOnce();
  });
});

describe("Stepper", () => {
  function StepHarness({ min, max, start }: { min: number; max: number; start: number }) {
    const [v, setV] = useState(start);
    return <Stepper value={v} min={min} max={max} onChange={setV} fewerLabel="Fewer" moreLabel="More" />;
  }
  it("never goes below min or above max", () => {
    render(<StepHarness min={1} max={3} start={2} />);
    const fewer = () => q<HTMLButtonElement>('button[aria-label="Fewer"]');
    const more = () => q<HTMLButtonElement>('button[aria-label="More"]');
    const shown = () => q('[aria-live="polite"]').textContent;
    click(fewer());
    expect(shown()).toBe("1");
    expect(fewer().disabled).toBe(true);
    click(fewer());
    expect(shown()).toBe("1");
    click(more());
    click(more());
    expect(shown()).toBe("3");
    expect(more().disabled).toBe(true);
    click(more());
    expect(shown()).toBe("3");
  });
});

describe("Check and Switch", () => {
  it("Check is a real checkbox named by its label", () => {
    const onChange = vi.fn();
    render(<Check checked={false} onChange={onChange} label="Milk" />);
    const i = q<HTMLInputElement>('input[type="checkbox"]');
    expect(i.getAttribute("aria-label")).toBe("Milk");
    click(i);
    expect(onChange).toHaveBeenCalledWith(true);
  });
  it("Switch is a checkbox with role switch", () => {
    const onChange = vi.fn();
    render(<Switch checked label="Reminders" onChange={onChange} />);
    const i = q<HTMLInputElement>('input[role="switch"]');
    expect(i.getAttribute("aria-label")).toBe("Reminders");
    expect(i.checked).toBe(true);
    click(i);
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe("LookPicker when storage throws", () => {
  it("still applies the chosen look for the session and keeps the radio on it", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    // With storage unwritable, the session look has to live somewhere other than storage.
    render(<LookPicker />);
    const radios = () => all('input[type="radio"]') as HTMLInputElement[];
    click(radios()[1]);
    expect(document.documentElement.getAttribute("data-look")).toBe("dark");
    expect(radios().map((r) => r.checked)).toEqual([false, true, false]);
    expect(localStorage.getItem(LOOK_KEY)).toBeNull();
  });
});
