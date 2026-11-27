// Shown at once while a tab's server render waits on the database, so a weak signal sees the page frame, not a blank screen.
export default function Loading() {
  return (
    <div className="mx-5 mt-3 flex flex-col gap-2" aria-hidden="true">
      {[0, 1, 2, 3].map((n) => (
        <div key={n} className="h-[52px] animate-pulse rounded-[14px] bg-[#EDF0EC]" />
      ))}
    </div>
  );
}
