import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8080),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.string().default("info"),
  /** Public base URL Twilio can reach, e.g. https://voice.example.com */
  PUBLIC_URL: z.string().url(),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  OPENAI_API_KEY: z.string(),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime"),
  OPENAI_REALTIME_VOICE: z.string().default("marin"),
  OPENAI_SUMMARY_MODEL: z.string().default("gpt-4.1-mini"),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  /** Validate X-Twilio-Signature on webhooks. Turn off only for local tunnels. */
  TWILIO_VALIDATE_SIGNATURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  /** JSON key for a Google service account with access to the business calendars. */
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),

  /** Bearer token the dashboard uses to call the admin API. */
  ADMIN_API_TOKEN: z.string().min(16),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
