// Route-level loading skeleton — shown while a dashboard page's data resolves. Uses the existing
// theme tokens (.card, animate-pulse); no page restyling. (#76 polish slice)
export default function Loading() {
  return (
    <div className="space-y-4 p-8" aria-busy="true" aria-label="Loading">
      <div className="card h-8 w-40 animate-pulse" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-20 animate-pulse" />
        ))}
      </div>
      <div className="card h-64 animate-pulse" />
    </div>
  );
}
