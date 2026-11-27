import { Loading, SkeletonLines, SkeletonTile } from "@/components/ui/states";

/** Shown at once while a screen streams in: a title, the hero photo and a grid of tiles. */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="bk-gutter">
        <SkeletonLines lines={2} size="body" />
      </div>
      <SkeletonTile crop="hero" />
      <div className="bk-gutter grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonTile key={i} crop="tile" />
        ))}
      </div>
      <Loading label="Loading" />
    </div>
  );
}
