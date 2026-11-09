/** "+12015550199" -> "(201) 555-0199". Leaves non-US numbers as they are. */
export function formatPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/** Call length like "2m 05s", or "—" while the call is still going. */
export function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return "—";
  const seconds = Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

export function formatPrice(cents: number | null): string {
  return cents == null ? "—" : `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/** "Mon, Nov 9, 10:00 AM" in the business's timezone, regardless of where the dashboard runs. */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** Calendar day key in the business timezone, used to group appointments. */
export function dayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}

export function formatDayHeading(key: string, timeZone: string, now = new Date()): string {
  const today = dayKey(now.toISOString(), timeZone);
  const tomorrow = dayKey(new Date(now.getTime() + 86_400_000).toISOString(), timeZone);
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  // Noon UTC keeps the date stable when formatting a bare YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(
    new Date(`${key}T12:00:00Z`),
  );
}
