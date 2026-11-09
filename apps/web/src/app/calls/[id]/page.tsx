import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { ApiError, api, getBusinessId } from "@/lib/api";
import { formatDateTime, formatDuration, formatPhone, formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const businessId = await getBusinessId();
  const [business, call] = await Promise.all([
    api.business(businessId),
    api.call(id).catch((err) => {
      if (err instanceof ApiError && err.status === 404) notFound();
      throw err;
    }),
  ]);
  const tz = business.timezone;

  return (
    <>
      <Link href="/calls" className="text-sm text-slate-500 hover:text-slate-900">
        ← All calls
      </Link>
      <PageHeader
        title={formatPhone(call.fromNumber)}
        description={`${formatDateTime(call.startedAt, tz)} · ${formatDuration(call.startedAt, call.endedAt)}`}
        action={<StatusBadge status={call.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card title="Summary">
            <p className="px-5 py-4 text-sm leading-relaxed text-slate-700">{call.summary ?? "The summary is being generated."}</p>
          </Card>
          <Card title="Booked on this call">
            {call.appointments.length === 0 ? (
              <EmptyState>Nothing was booked.</EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100">
                {call.appointments.map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{a.service.name}</p>
                      <StatusBadge status={a.status} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {a.customerName} · {formatDateTime(a.startsAt, tz)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Transcript" className="lg:col-span-2">
          {call.transcript.length === 0 ? (
            <EmptyState>No transcript for this call.</EmptyState>
          ) : (
            <ol className="space-y-3 px-5 py-4">
              {call.transcript.map((t, i) => (
                <li key={i} className={`flex ${t.role === "agent" ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                      t.role === "agent" ? "rounded-bl-sm bg-slate-100 text-slate-800" : "rounded-br-sm bg-brand-600 text-white"
                    }`}
                  >
                    <p>{t.text}</p>
                    <p className={`mt-1 text-[11px] ${t.role === "agent" ? "text-slate-400" : "text-brand-100"}`}>
                      {t.role === "agent" ? "Receptionist" : "Caller"} · {formatTime(t.at, tz)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}
