import type { ReactNode } from "react";
import type { AppointmentStatus, CallStatus } from "@/lib/types";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {title && <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">{title}</h2>}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

const statusStyles: Record<CallStatus | AppointmentStatus, string> = {
  IN_PROGRESS: "bg-amber-50 text-amber-700 ring-amber-200",
  COMPLETED: "bg-slate-100 text-slate-700 ring-slate-200",
  FAILED: "bg-red-50 text-red-700 ring-red-200",
  PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
  CONFIRMED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CANCELLED: "bg-slate-100 text-slate-500 ring-slate-200",
};

const statusLabels: Record<CallStatus | AppointmentStatus, string> = {
  IN_PROGRESS: "Live",
  COMPLETED: "Completed",
  FAILED: "Failed",
  PENDING: "Syncing",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
};

export function StatusBadge({ status }: { status: CallStatus | AppointmentStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-slate-500">{children}</p>;
}
