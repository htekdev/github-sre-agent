import pino from "pino";
import { config } from "../config/index.js";

export const logger = pino({
  level: config.LOG_LEVEL,
  transport: config.NODE_ENV === "development" 
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});

export function createChildLogger(name: string) {
  return logger.child({ component: name });
}
