// Loading skeleton for a single run's receipt page. (#76 polish slice)
export default function Loading() {
  return (
    <div className="space-y-4 p-8" aria-busy="true" aria-label="Loading run">
      <div className="card h-8 w-56 animate-pulse" />
      <div className="card h-32 animate-pulse" />
      <div className="card h-72 animate-pulse" />
    </div>
  );
}
