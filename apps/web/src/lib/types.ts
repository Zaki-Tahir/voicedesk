export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type WeeklyHours = Record<Weekday, [string, string][]>;

export interface Service {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number | null;
}

export interface Business {
  id: string;
  name: string;
  phoneNumber: string;
  timezone: string;
  greeting: string;
  notes: string;
  hours: WeeklyHours;
  calendarId: string | null;
  services: Service[];
}

export interface Stats {
  callsToday: number;
  callsThisWeek: number;
  bookedThisWeek: number;
  upcoming: number;
}

export type CallStatus = "IN_PROGRESS" | "COMPLETED" | "FAILED";

export interface CallSummary {
  id: string;
  fromNumber: string;
  status: CallStatus;
  startedAt: string;
  endedAt: string | null;
  summary: string | null;
}

export interface TranscriptEntry {
  role: "caller" | "agent";
  text: string;
  at: string;
}

export type AppointmentStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "FAILED";

export interface Appointment {
  id: string;
  customerName: string;
  customerPhone: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  service: { name: string };
}

export interface CallDetail extends CallSummary {
  transcript: TranscriptEntry[];
  appointments: Appointment[];
}
