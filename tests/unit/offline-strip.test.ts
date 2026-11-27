import { describe, expect, it } from "vitest";
import { reconnectedStrip, STRIP_MS } from "@/lib/list/offline-strip";

describe("the line shown when the signal comes back", () => {
  it("says Saved only when the queue emptied and nothing was refused", () => {
    expect(reconnectedStrip({ queueLeft: 0, refused: false, sent: true })).toBe("saved");
  });
  it("says only Back online when something is still waiting", () => {
    expect(reconnectedStrip({ queueLeft: 2, refused: false, sent: true })).toBe("back");
  });
  it("says only Back online when the server refused a change", () => {
    expect(reconnectedStrip({ queueLeft: 0, refused: true, sent: true })).toBe("back");
  });
  it("says only Back online when nothing was sent", () => {
    expect(reconnectedStrip({ queueLeft: 0, refused: false, sent: false })).toBe("back");
  });
  it("leaves after 2 seconds", () => {
    expect(STRIP_MS).toBe(2000);
  });
});
