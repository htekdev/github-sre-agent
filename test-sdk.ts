
import { z } from "zod";
import { CopilotClient, defineTool } from "@github/copilot-sdk";

async function test() {
  console.log("Creating client...");
  const client = new CopilotClient({
    autoStart: true,
    autoRestart: true,
    logLevel: 'debug',
  });
  
  console.log("Starting client...");
  await client.start();
  console.log("Client started!");
  console.log("Creating session...");
  const facts: Record<string, string> = {
      javascript: "JavaScript was created in 10 days by Brendan Eich in 1995.",
      node: "Node.js lets you run JavaScript outside the browser using the V8 engine.",
  };

  const lookupFactTool = defineTool("lookup_fact", {
      description: "Returns a fun fact about a given topic.",
      parameters: z.object({
          topic: z.string().describe("Topic to look up (e.g. 'javascript', 'node')"),
      }),
      handler: ({ topic }) => facts[topic.toLowerCase()] ?? `No fact stored for ${topic}.`,
  });

  const session = await client.createSession({
    tools: [lookupFactTool],
  });
  console.log("Session created:", session.sessionId);
  
  console.log("\nSending prompt using sendAndWait()...");
  const response = await session.sendAndWait({ prompt: "Say hello in exactly one word" });
  
  console.log("\nResult:", response?.data.content);
  
  await session.destroy();
  await client.forceStop();
  console.log("Done!");
}

test().catch(console.error);
