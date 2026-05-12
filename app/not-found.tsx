import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-primary via-bg-primary to-violet-900/20 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold text-nexus-cyan mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-white mb-4">Page Not Found</h2>
        <p className="text-gray-400 mb-8">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center px-6 py-3 rounded-lg bg-gradient-to-r from-nexus-cyan to-violet-600 text-white font-medium hover:shadow-lg hover:shadow-nexus-cyan/20 transition-all"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
