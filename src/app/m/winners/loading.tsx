export default function WinnersLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-2xl bg-neutral-100" />
        <div className="space-y-2">
          <div className="h-7 w-40 bg-neutral-100 rounded-lg" />
          <div className="h-3 w-64 bg-neutral-100 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 rounded-3xl bg-neutral-100" />
        ))}
      </div>
      <div className="h-[480px] rounded-3xl bg-neutral-100" />
    </div>
  );
}
