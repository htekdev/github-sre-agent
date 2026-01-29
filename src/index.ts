import "dotenv/config";
import { startServer } from "./server/index.js";
import { NoteStore } from "./services/index.js";
import { createChildLogger } from "./services/logger.js";

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
