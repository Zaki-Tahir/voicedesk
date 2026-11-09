import { z } from "zod";
import { BookingError, type BookingService } from "../booking/service.js";
import type { BusinessProfile } from "../booking/types.js";
import { describeHours, describeServices } from "./instructions.js";

/** Function tools exposed to the realtime model (Realtime API "function" tool format). */
export const toolDefinitions = [
  {
    type: "function",
    name: "check_availability",
    description: "List open appointment start times for a service on one day. Always call this before offering times.",
    parameters: {
      type: "object",
      properties: {
        service: { type: "string", description: "Service name, e.g. Haircut" },
        date: { type: "string", description: "Day to check, YYYY-MM-DD, in the business's timezone" },
      },
      required: ["service", "date"],
    },
  },
  {
    type: "function",
    name: "book_appointment",
    description: "Book an appointment after the caller has confirmed the service, time and their name.",
    parameters: {
      type: "object",
      properties: {
        service: { type: "string" },
        start: { type: "string", description: "Local start time, YYYY-MM-DDTHH:mm" },
        customer_name: { type: "string", description: "Caller's first and last name" },
        phone_number: {
          type: "string",
          description: "Only if the caller wants the text sent to a different number than the one they're calling from",
        },
      },
      required: ["service", "start", "customer_name"],
    },
  },
  {
    type: "function",
    name: "get_business_info",
    description: "Opening hours, services with prices, and other details about the business.",
    parameters: { type: "object", properties: {} },
  },
] as const;

const checkArgs = z.object({ service: z.string().min(1), date: z.string().min(1) });
const bookArgs = z.object({
  service: z.string().min(1),
  start: z.string().min(1),
  customer_name: z.string().min(2),
  phone_number: z.string().optional(),
});

export interface ToolContext {
  business: BusinessProfile;
  booking: BookingService;
  callId: string;
  callerNumber: string;
}

export type ToolHandler = (name: string, argsJson: string) => Promise<string>;

/**
 * Returns a handler that runs a tool call and always resolves to a JSON string for the model.
 * Problems the caller can fix ("that time is taken") come back as { error } so the model can
 * say so and offer something else, instead of the call failing.
 */
export function createToolHandler(ctx: ToolContext): ToolHandler {
  return async (name, argsJson) => {
    try {
      const args: unknown = argsJson ? JSON.parse(argsJson) : {};
      switch (name) {
        case "check_availability": {
          const { service, date } = checkArgs.parse(args);
          const result = await ctx.booking.checkAvailability(ctx.business, service, date);
          // Keep the payload small: the model only needs a handful to offer.
          return JSON.stringify({ ...result, slots: result.slots.slice(0, 12), total: result.slots.length });
        }
        case "book_appointment": {
          const a = bookArgs.parse(args);
          const result = await ctx.booking.book(ctx.business, {
            serviceName: a.service,
            start: a.start,
            customerName: a.customer_name,
            customerPhone: a.phone_number ?? ctx.callerNumber,
            callId: ctx.callId,
          });
          return JSON.stringify({ booked: true, ...result });
        }
        case "get_business_info":
          return JSON.stringify({
            name: ctx.business.name,
            hours: describeHours(ctx.business),
            services: describeServices(ctx.business),
            notes: ctx.business.notes,
          });
        default:
          return JSON.stringify({ error: `Unknown tool ${name}` });
      }
    } catch (err) {
      if (err instanceof BookingError) return JSON.stringify({ error: err.message });
      if (err instanceof z.ZodError || err instanceof SyntaxError) {
        return JSON.stringify({ error: "The tool arguments were invalid. Ask the caller again." });
      }
      throw err;
    }
  };
}
