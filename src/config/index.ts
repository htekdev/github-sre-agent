import { z } from "zod";

// Environment schema
const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  GITHUB_WEBHOOK_SECRET: z.string().min(1, "GITHUB_WEBHOOK_SECRET is required"),
  EXA_API_KEY: z.string().optional(),
  COPILOT_MODEL: z.string().default("Claude Sonnet 4"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(result.error.format());
    process.exit(1);
  }
  
  console.log(`📋 Config loaded: model=${result.data.COPILOT_MODEL}, logLevel=${result.data.LOG_LEVEL}`);
  return result.data;
}

export const config = loadEnv();
