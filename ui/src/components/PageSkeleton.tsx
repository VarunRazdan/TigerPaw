export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-neutral-800/50" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-40 rounded-2xl bg-neutral-800/50" />
        <div className="h-40 rounded-2xl bg-neutral-800/50" />
      </div>
      <div className="h-64 rounded-2xl bg-neutral-800/50" />
    </div>
  );
}
