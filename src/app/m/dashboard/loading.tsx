export default function DashboardLoading() {
  return (
    <div className="space-y-8 pb-12 animate-pulse">
      <div className="h-40 rounded-3xl bg-neutral-100" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-3xl bg-neutral-100" />
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-72 rounded-3xl bg-neutral-100" />
        <div className="h-72 rounded-3xl bg-neutral-100" />
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="h-64 rounded-3xl bg-neutral-100" />
        <div className="h-64 rounded-3xl bg-neutral-100" />
      </div>
      <div className="h-48 rounded-3xl bg-neutral-100" />
    </div>
  );
}
