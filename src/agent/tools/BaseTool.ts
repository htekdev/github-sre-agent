import { z, ZodType } from "zod";
import type { ToolResult } from "../../types/index.js";

/**
 * Base class for all SRE agent tools.
 * Provides a consistent interface for tool definition and execution.
 */
export abstract class BaseTool<TParams = unknown, TResult = unknown> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: ZodType<TParams>;

  /**
   * Execute the tool with the given parameters
   */
  abstract execute(params: TParams): Promise<ToolResult<TResult>>;

  /**
   * Get the tool definition for the Copilot SDK
   */
  getDefinition() {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
    };
  }

  /**
   * Wrap execution with error handling
   */
  async safeExecute(params: unknown): Promise<ToolResult<TResult>> {
    try {
      const validated = this.parameters.parse(params) as TParams;
      return await this.execute(validated);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Tool '${this.name}' failed: ${message}`,
      };
    }
  }
}
