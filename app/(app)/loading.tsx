export default function AppLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-primary via-bg-primary to-violet-900/20 flex items-center justify-center p-4">
      <div className="text-center" role="status" aria-live="polite">
        <div className="w-10 h-10 border-2 border-nexus-cyan border-t-transparent rounded-full animate-spin mx-auto mb-4" aria-hidden="true" />
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    </div>
  );
}
