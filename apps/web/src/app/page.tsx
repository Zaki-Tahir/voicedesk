import Link from "next/link";
import { Card, EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { api, getBusinessId } from "@/lib/api";
import { formatDateTime, formatPhone, formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const id = await getBusinessId();
  const [business, stats, calls, appointments] = await Promise.all([
    api.business(id),
    api.stats(id),
    api.calls(id, 5),
    api.appointments(id),
  ]);
  const tz = business.timezone;
  const upcoming = appointments.filter((a) => a.status !== "CANCELLED").slice(0, 5);

  return (
    <>
      <PageHeader title={business.name} description={`Answering ${formatPhone(business.phoneNumber)}`} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Calls today" value={stats.callsToday} />
        <StatCard label="Calls this week" value={stats.callsThisWeek} />
        <StatCard label="Booked this week" value={stats.bookedThisWeek} hint="Confirmed by the agent" />
        <StatCard label="Upcoming" value={stats.upcoming} hint="Confirmed appointments ahead" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Next appointments">
          {upcoming.length === 0 ? (
            <EmptyState>No appointments in the next two weeks.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">{a.customerName}</p>
                    <p className="text-xs text-slate-500">
                      {a.service.name} · {formatDateTime(a.startsAt, tz)}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent calls">
          {calls.length === 0 ? (
            <EmptyState>No calls yet. Call your VoiceDesk number to try it.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {calls.map((c) => (
                <li key={c.id}>
                  <Link href={`/calls/${c.id}`} className="block px-5 py-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-medium">{formatPhone(c.fromNumber)}</p>
                      <span className="text-xs text-slate-500">{formatTime(c.startedAt, tz)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{c.summary ?? "Summary pending…"}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
