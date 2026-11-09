import type { Appointment, Business, CallDetail, CallSummary, Service, Stats, WeeklyHours } from "./types";

// Server-side only: these run in server components and server actions, so the token never reaches the browser.
const API_URL = process.env.API_URL ?? "http://localhost:8080";
const TOKEN = process.env.ADMIN_API_TOKEN ?? "";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    cache: "no-store",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    let message = body;
    try {
      const json = JSON.parse(body) as { error?: string; issues?: { path: string[]; message: string }[] };
      message = json.issues?.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") || json.error || body;
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

/** The dashboard shows one business: BUSINESS_ID if set, otherwise the first one. */
export async function getBusinessId(): Promise<string> {
  if (process.env.BUSINESS_ID) return process.env.BUSINESS_ID;
  const list = await request<{ id: string }[]>("/businesses");
  if (!list[0]) throw new Error("No business found. Run `npm run db:seed -w apps/server` first.");
  return list[0].id;
}

export const api = {
  business: (id: string) => request<Business>(`/businesses/${id}`),
  stats: (id: string) => request<Stats>(`/businesses/${id}/stats`),
  calls: (id: string, limit = 50) => request<CallSummary[]>(`/businesses/${id}/calls?limit=${limit}`),
  call: (callId: string) => request<CallDetail>(`/calls/${callId}`),
  appointments: (id: string) => request<Appointment[]>(`/businesses/${id}/appointments`),
  updateBusiness: (
    id: string,
    body: Partial<Pick<Business, "name" | "greeting" | "notes" | "timezone"> & { hours: WeeklyHours }>,
  ) => request<Business>(`/businesses/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  replaceServices: (id: string, services: Omit<Service, "id">[]) =>
    request<Service[]>(`/businesses/${id}/services`, { method: "PUT", body: JSON.stringify({ services }) }),
};
