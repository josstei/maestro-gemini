import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLogger } from "./lib/logger.js";
import { SESSION_READ_TOOL, SESSION_WRITE_TOOL } from "./tools/session.js";
import { PROGRESS_TOOL } from "./tools/progress.js";
import { VALIDATE_PLAN_TOOL } from "./tools/validation.js";
import {
  DISPATCH_STATUS_TOOL,
  CONTEXT_CHAIN_TOOL,
} from "./tools/dispatch.js";

const logger = createLogger("server");

const server = new McpServer({
  name: "maestro",
  version: "1.1.0",
});

const tools = [
  SESSION_READ_TOOL,
  SESSION_WRITE_TOOL,
  PROGRESS_TOOL,
  VALIDATE_PLAN_TOOL,
  DISPATCH_STATUS_TOOL,
  CONTEXT_CHAIN_TOOL,
];

for (const tool of tools) {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.inputSchema,
    },
    async (args: unknown) => {
      try {
        const result = await tool.handler(args);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        logger.error(`Tool ${tool.name} failed`, { error: message });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Maestro MCP server started", {
    tools: tools.map((t) => t.name),
  });
}

main().catch((error) => {
  logger.error("Failed to start server", { error: String(error) });
  process.exit(1);
});
