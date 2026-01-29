import { Hono } from "hono";
import { logger as pinoLogger } from "hono/logger";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { config } from "../config/index.js";
import { createChildLogger } from "../services/logger.js";
import { webhookRoutes } from "./routes/webhooks.js";

const logger = createChildLogger("Server");

export function createServer() {
  const app = new Hono();

  // Middleware
  app.use("*", cors());
  
  // Request logging in development
  if (config.NODE_ENV === "development") {
    app.use("*", pinoLogger());
  }

  // Mount routes
  app.route("/", webhookRoutes);

  // Root endpoint
  app.get("/", (c) => {
    return c.json({
      name: "GitHub SRE Agent",
      version: "0.1.0",
      description: "AI-powered SRE agent for GitHub Actions",
      endpoints: {
        webhook: "POST /webhook",
        health: "GET /health",
        status: "GET /status",
      },
    });
  });

  // 404 handler
  app.notFound((c) => {
    return c.json({ error: "Not found" }, 404);
  });

  // Error handler
  app.onError((err, c) => {
    logger.error({ error: err.message }, "Unhandled error");
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}

export async function startServer(): Promise<void> {
  const app = createServer();

  serve({
    fetch: app.fetch,
    port: config.PORT,
  }, (info) => {
    logger.info(
      { port: info.port, env: config.NODE_ENV },
      "🚀 GitHub SRE Agent server started"
    );
    
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🤖 GitHub SRE Agent                                          ║
║                                                                ║
║   Server running at: http://localhost:${config.PORT}                 ║
║   Webhook endpoint:  http://localhost:${config.PORT}/webhook          ║
║   Health check:      http://localhost:${config.PORT}/health           ║
║                                                                ║
║   Environment: ${config.NODE_ENV.padEnd(46)}║
║   Model: ${config.COPILOT_MODEL.padEnd(52)}║
║                                                                ║
║   💡 Use ngrok to expose this server:                          ║
║      npx ngrok http ${config.PORT}                                     ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
    `);
  });
}
