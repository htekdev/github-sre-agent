import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "crypto";
import { config } from "../../config/index.js";
import { createChildLogger } from "../../services/logger.js";
import { WorkflowRunHandler } from "../../handlers/index.js";
import { workflowRunEventSchema } from "../../types/index.js";

const logger = createChildLogger("WebhookRoutes");

export const webhookRoutes = new Hono();

// Webhook handler instance
const workflowHandler = new WorkflowRunHandler();

/**
 * Verify GitHub webhook signature
 */
function verifySignature(payload: string, signature: string | null): boolean {
  if (!signature) {
    logger.warn("Missing webhook signature");
    return false;
  }

  const expectedSignature = `sha256=${createHmac("sha256", config.GITHUB_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex")}`;

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Main webhook endpoint
 */
webhookRoutes.post("/webhook", async (c) => {
  const signature = c.req.header("X-Hub-Signature-256");
  const event = c.req.header("X-GitHub-Event");
  const deliveryId = c.req.header("X-GitHub-Delivery");

  // Get raw body for signature verification
  const rawBody = await c.req.text();

  // Verify signature
  if (!verifySignature(rawBody, signature ?? null)) {
    logger.warn({ deliveryId }, "Invalid webhook signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  // Parse payload
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logger.warn({ deliveryId }, "Invalid JSON payload");
    return c.json({ error: "Invalid JSON" }, 400);
  }

  logger.info({ event, deliveryId }, "Webhook received");

  // Route based on event type
  switch (event) {
    case "workflow_run": {
      const parsed = workflowRunEventSchema.safeParse(payload);
      
      if (!parsed.success) {
        logger.warn({ deliveryId, errors: parsed.error.issues }, "Invalid workflow_run payload");
        return c.json({ error: "Invalid payload", details: parsed.error.issues }, 400);
      }

      try {
        const result = await workflowHandler.handle(parsed.data);
        
        return c.json({
          success: true,
          processed: result.processed,
          message: result.processed 
            ? "Workflow run processed by SRE agent" 
            : "Workflow run acknowledged (no action needed)",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error({ deliveryId, error: message }, "Failed to process workflow_run");
        return c.json({ error: "Processing failed", message }, 500);
      }
    }

    case "ping": {
      logger.info({ deliveryId }, "Ping received");
      return c.json({ success: true, message: "Pong!" });
    }

    default: {
      logger.debug({ event, deliveryId }, "Unhandled event type");
      return c.json({ 
        success: true, 
        message: `Event '${event}' acknowledged but not processed` 
      });
    }
  }
});

/**
 * Health check endpoint
 */
webhookRoutes.get("/health", (c) => {
  return c.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  });
});

/**
 * Status endpoint with more details
 */
webhookRoutes.get("/status", async (c) => {
  return c.json({
    status: "running",
    environment: config.NODE_ENV,
    model: config.COPILOT_MODEL,
    timestamp: new Date().toISOString(),
  });
});
