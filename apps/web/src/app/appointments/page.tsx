import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { api, getBusinessId } from "@/lib/api";
import { dayKey, formatDayHeading, formatPhone, formatTime } from "@/lib/format";
import type { Appointment } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AppointmentsPage() {
  const id = await getBusinessId();
  const [business, appointments] = await Promise.all([api.business(id), api.appointments(id)]);
  const tz = business.timezone;

  const byDay = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const key = dayKey(a.startsAt, tz);
    byDay.set(key, [...(byDay.get(key) ?? []), a]);
  }

  return (
    <>
      <PageHeader title="Appointments" description="The next two weeks. Bookings sync to your calendar automatically." />
      {byDay.size === 0 ? (
        <Card>
          <EmptyState>No appointments in the next two weeks.</EmptyState>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...byDay.entries()].map(([day, items]) => (
            <Card key={day} title={formatDayHeading(day, tz)}>
              <ul className="divide-y divide-slate-100">
                {items.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3">
                    <span className="w-24 text-sm font-medium tabular-nums">{formatTime(a.startsAt, tz)}</span>
                    <span className="flex-1 text-sm">
                      <span className="font-medium">{a.customerName}</span>
                      <span className="text-slate-500"> · {a.service.name}</span>
                    </span>
                    <span className="text-sm text-slate-500">{formatPhone(a.customerPhone)}</span>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
