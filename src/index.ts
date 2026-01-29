// Manual .env loader to avoid dotenv conflicts with Copilot SDK
import { readFileSync, existsSync } from "fs";
import { join } from "path";

function loadEnvFile() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

// Now import everything else
const { startServer } = await import("./server/index.js");
const { NoteStore } = await import("./services/index.js");
const { createChildLogger } = await import("./services/logger.js");

const logger = createChildLogger("Main");

async function main() {
  try {
    // Initialize note store
    await NoteStore.getInstance().init();
    
    // Start server
    await startServer();
  } catch (error) {
    logger.fatal({ error }, "Failed to start application");
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down...");
  process.exit(0);
});

main();
