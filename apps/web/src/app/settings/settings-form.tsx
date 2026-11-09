"use client";

import { useState, useTransition } from "react";
import type { Business, Weekday, WeeklyHours } from "@/lib/types";
import { type SaveResult, saveSettings } from "./actions";

const DAYS: { key: Weekday; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

interface ServiceRow {
  key: number;
  name: string;
  durationMin: string;
  price: string;
}

const input =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none";

export function SettingsForm({ business }: { business: Business }) {
  const [name, setName] = useState(business.name);
  const [greeting, setGreeting] = useState(business.greeting);
  const [notes, setNotes] = useState(business.notes);
  const [hours, setHours] = useState<WeeklyHours>(business.hours);
  const [services, setServices] = useState<ServiceRow[]>(
    business.services.map((s, i) => ({
      key: i,
      name: s.name,
      durationMin: String(s.durationMin),
      price: s.priceCents == null ? "" : (s.priceCents / 100).toFixed(2),
    })),
  );
  const [result, setResult] = useState<SaveResult | null>(null);
  const [pending, startTransition] = useTransition();

  // The editor shows one opening range per day; split shifts can still be set through the API.
  const setDay = (day: Weekday, range: [string, string] | null) =>
    setHours((h) => ({ ...h, [day]: range ? [range] : [] }));

  const updateService = (key: number, patch: Partial<ServiceRow>) =>
    setServices((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      setResult(
        await saveSettings({
          name,
          greeting,
          notes,
          hours,
          services: services
            .filter((s) => s.name.trim())
            .map((s) => ({
              name: s.name.trim(),
              durationMin: Number(s.durationMin),
              priceCents: s.price.trim() === "" ? null : Math.round(Number(s.price) * 100),
            })),
        }),
      );
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">How the agent answers</h2>
        <label className="block">
          <span className="text-sm font-medium">Business name</span>
          <input className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Greeting</span>
          <input className={`${input} mt-1`} value={greeting} onChange={(e) => setGreeting(e.target.value)} required />
          <span className="mt-1 block text-xs text-slate-500">The first thing callers hear.</span>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Things the agent should know</span>
          <textarea
            className={`${input} mt-1`}
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Parking, cancellation policy, payment methods…"
          />
        </label>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Opening hours ({business.timezone})</h2>
        <div className="space-y-2">
          {DAYS.map(({ key, label }) => {
            const range = hours[key]?.[0] ?? null;
            return (
              <div key={key} className="flex flex-wrap items-center gap-3">
                <label className="flex w-36 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={range !== null}
                    onChange={(e) => setDay(key, e.target.checked ? ["09:00", "17:00"] : null)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  />
                  {label}
                </label>
                {range ? (
                  <div className="flex items-center gap-2">
                    <input type="time" className={`${input} w-32`} value={range[0]} onChange={(e) => setDay(key, [e.target.value, range[1]])} />
                    <span className="text-slate-400">to</span>
                    <input type="time" className={`${input} w-32`} value={range[1]} onChange={(e) => setDay(key, [range[0], e.target.value])} />
                  </div>
                ) : (
                  <span className="text-sm text-slate-400">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Services</h2>
        <div className="space-y-2">
          <div className="hidden grid-cols-[1fr_110px_110px_40px] gap-2 text-xs font-medium text-slate-500 sm:grid">
            <span>Name</span>
            <span>Minutes</span>
            <span>Price ($)</span>
          </div>
          {services.map((s) => (
            <div key={s.key} className="grid grid-cols-[1fr_90px_90px_40px] gap-2 sm:grid-cols-[1fr_110px_110px_40px]">
              <input className={input} value={s.name} onChange={(e) => updateService(s.key, { name: e.target.value })} placeholder="Haircut" />
              <input className={input} type="number" min={5} max={480} step={5} value={s.durationMin} onChange={(e) => updateService(s.key, { durationMin: e.target.value })} required />
              <input className={input} type="number" min={0} step="0.01" value={s.price} onChange={(e) => updateService(s.key, { price: e.target.value })} placeholder="—" />
              <button
                type="button"
                aria-label={`Remove ${s.name || "service"}`}
                onClick={() => setServices((rows) => rows.filter((r) => r.key !== s.key))}
                className="rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-600"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setServices((rows) => [...rows, { key: Date.now(), name: "", durationMin: "30", price: "" }])}
          className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          + Add service
        </button>
      </section>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {result?.ok && <p className="text-sm text-emerald-700">Saved. New calls will use these settings.</p>}
        {result && !result.ok && <p className="text-sm text-red-600">{result.error}</p>}
      </div>
    </form>
  );
}
