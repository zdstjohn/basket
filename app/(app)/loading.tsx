import { Loading } from "@/components/ui/states";

/**
 * A neutral placeholder while a tab streams in: only the header's title lines, so no screen's shape is promised.
 * It fades in after a beat (the delay), so a quick load shows nothing at all. The fade is opacity-only, and the
 * one wrapper that pulses stops under reduced motion.
 */
export default function AppLoading() {
  return (
    <div className="bk-fade-in bk-gutter pb-4" style={{ animationDelay: "240ms" }}>
      <div aria-hidden="true" className="flex animate-pulse flex-col gap-2 motion-reduce:animate-none">
        <div className="h-4 w-full rounded-xs bg-[var(--bk-sunk)]" />
        <div className="h-4 w-2/3 rounded-xs bg-[var(--bk-sunk)]" />
      </div>
      <Loading label="Loading" />
    </div>
  );
}
