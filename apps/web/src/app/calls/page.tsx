import Link from "next/link";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { api, getBusinessId } from "@/lib/api";
import { formatDateTime, formatDuration, formatPhone } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const id = await getBusinessId();
  const [business, calls] = await Promise.all([api.business(id), api.calls(id, 100)]);

  return (
    <>
      <PageHeader title="Calls" description="Every call the agent answered, with an AI summary." />
      <Card>
        {calls.length === 0 ? (
          <EmptyState>No calls yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Caller</th>
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-5 py-3 font-medium">Length</th>
                  <th className="px-5 py-3 font-medium">Summary</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {calls.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-3 font-medium">
                      <Link href={`/calls/${c.id}`} className="hover:text-brand-600">
                        {formatPhone(c.fromNumber)}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-slate-600">{formatDateTime(c.startedAt, business.timezone)}</td>
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums text-slate-600">{formatDuration(c.startedAt, c.endedAt)}</td>
                    <td className="min-w-64 max-w-md px-5 py-3 text-slate-600">
                      <span className="line-clamp-2">{c.summary ?? "—"}</span>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
