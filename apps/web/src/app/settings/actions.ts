"use server";

import { revalidatePath } from "next/cache";
import { ApiError, api, getBusinessId } from "@/lib/api";
import type { Service, WeeklyHours } from "@/lib/types";

export interface SettingsInput {
  name: string;
  greeting: string;
  notes: string;
  hours: WeeklyHours;
  services: Omit<Service, "id">[];
}

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveSettings(input: SettingsInput): Promise<SaveResult> {
  try {
    const id = await getBusinessId();
    await api.updateBusiness(id, { name: input.name, greeting: input.greeting, notes: input.notes, hours: input.hours });
    await api.replaceServices(id, input.services);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) return { ok: false, error: err.message };
    throw err;
  }
}
