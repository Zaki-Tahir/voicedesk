"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
      <h1 className="text-lg font-semibold">Couldn&apos;t load this page</h1>
      <p className="mt-2 text-sm text-slate-600">
        The dashboard couldn&apos;t reach the VoiceDesk API. Check that the server is running and that ADMIN_API_TOKEN matches.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-slate-400">ref {error.digest}</p>}
      <button onClick={reset} className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
        Try again
      </button>
    </div>
  );
}
