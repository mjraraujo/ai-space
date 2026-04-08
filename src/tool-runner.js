/**
 * Tool Runner — typed tool-calling system with sandboxed execution.
 *
 * Extends RuntimeAgent with:
 *   - Typed ToolCall / ToolResult envelopes (OpenAI wire-format compatible)
 *   - Named tool registry (register JS functions as tools)
 *   - Structured audit-friendly execution records
 *   - Full backward-compatibility: RuntimeAgent.run() still works unchanged
 *
 * The DSL script executor (LOG/RUN/WAIT/…) from RuntimeAgent is preserved
 * in a Web Worker for untrusted scripts. Named tools run in the main thread
 * with explicit capability grants.
 */

import { RuntimeAgent } from './runtime-agent.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ToolDefinition
 * @property {string}   name
 * @property {string}   description
 * @property {object}   parameters   - JSON Schema for the function arguments
 * @property {Function} execute      - async (args: object, ctx: ToolContext) => any
 * @property {string[]} [permissions]
 */

/**
 * @typedef {Object} ToolContext
 * @property {string} conversationId
 * @property {object} [memory]
 * @property {object} [audit]
 */

/**
 * @typedef {Object} ToolCall
 * @property {string} id
 * @property {'function'} type
 * @property {{ name: string, arguments: string }} function
 */

/**
 * @typedef {Object} ToolResult
 * @property {string}  callId
 * @property {string}  toolName
 * @property {boolean} ok
 * @property {any}     [output]
 * @property {string}  [error]
 * @property {number}  durationMs
 */

// ─── ToolRunner ───────────────────────────────────────────────────────────────

export class ToolRunner extends RuntimeAgent {
  constructor() {
    super();
    /** @type {Map<string, ToolDefinition>} */
    this._tools = new Map();
  }

  // ─── Named Tool Registry ──────────────────────────────────────────────────

  /**
   * Register a named tool that can be called by the AI via function-calling.
   * @param {ToolDefinition} definition
   */
  registerTool(definition) {
    if (!definition?.name) throw new Error('ToolRunner: tool definition must have a name');
    this._tools.set(definition.name, definition);
  }

  /**
   * Unregister a tool.
   * @param {string} name - Tool name to remove
   */
  unregisterTool(name) {
    this._tools.delete(name);
  }

  /**
   * Check if a tool is registered.
   * @param {string} name
   * @returns {boolean}
   */
  hasTool(name) {
    return this._tools.has(name);
  }

  /**
   * Get all registered tool definitions as OpenAI-compatible ToolDef objects.
   * @returns {import('./model-adapter.js').ToolDef[]}
   */
  getToolDefs() {
    return [...this._tools.values()].map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }

  // ─── Tool Execution ───────────────────────────────────────────────────────

  /**
   * Execute a single ToolCall envelope (as returned by the AI model).
   * @param {ToolCall} toolCall
   * @param {ToolContext} [ctx]
   * @returns {Promise<ToolResult>}
   */
  async executeToolCall(toolCall, ctx = {}) {
    const startedAt = Date.now();
    const callId = toolCall.id || `tc_${Date.now()}`;
    const toolName = toolCall.function?.name || '';
    const argsRaw = toolCall.function?.arguments || '{}';

    let args = {};
    try {
      args = JSON.parse(argsRaw);
    } catch {
      return {
        callId,
        toolName,
        ok: false,
        error: `Invalid JSON arguments: ${argsRaw}`,
        durationMs: Date.now() - startedAt
      };
    }

    const tool = this._tools.get(toolName);
    if (!tool) {
      return {
        callId,
        toolName,
        ok: false,
        error: `Unknown tool: "${toolName}"`,
        durationMs: Date.now() - startedAt
      };
    }

    try {
      const output = await tool.execute(args, ctx);
      return {
        callId,
        toolName,
        ok: true,
        output,
        durationMs: Date.now() - startedAt
      };
    } catch (err) {
      return {
        callId,
        toolName,
        ok: false,
        error: err?.message || String(err),
        durationMs: Date.now() - startedAt
      };
    }
  }

  /**
   * Execute multiple ToolCalls in order.
   * @param {ToolCall[]} toolCalls
   * @param {ToolContext} [ctx]
   * @returns {Promise<ToolResult[]>}
   */
  async executeToolCalls(toolCalls, ctx = {}) {
    const results = [];
    for (const call of toolCalls) {
      results.push(await this.executeToolCall(call, ctx));
    }
    return results;
  }

  /**
   * Convert ToolResult[] to the message objects expected by OpenAI-compatible APIs.
   * @param {ToolResult[]} results
   * @returns {import('./model-adapter.js').ChatMessage[]}
   */
  static toolResultsToMessages(results) {
    return results.map((r) => ({
      role: 'tool',
      name: r.toolName,
      content: r.ok
        ? (typeof r.output === 'string' ? r.output : JSON.stringify(r.output))
        : `Error: ${r.error}`
    }));
  }

  // ─── Built-in Tools ───────────────────────────────────────────────────────

  /**
   * Register the default set of built-in tools.
   * These provide safe, browser-native capabilities to the AI.
   */
  registerBuiltIns() {
    // fetch-url: retrieve public web content
    this.registerTool({
      name: 'fetch_url',
      description: 'Fetch the text content of a public URL. Use for web lookups and article extraction.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch' },
          method: { type: 'string', enum: ['GET', 'POST'], default: 'GET' }
        },
        required: ['url']
      },
      permissions: ['network'],
      execute: async ({ url, method = 'GET' }) => {
        const res = await fetch(url, { method });
        const text = await res.text();
        // Truncate to avoid overflowing context
        return {
          status: res.status,
          ok: res.ok,
          url: res.url,
          content: text.length > 8000 ? text.slice(0, 8000) + '\n…[truncated]' : text
        };
      }
    });

    // get-timestamp
    this.registerTool({
      name: 'get_timestamp',
      description: 'Return the current date and time in ISO 8601 format.',
      parameters: { type: 'object', properties: {} },
      permissions: [],
      execute: async () => ({ iso: new Date().toISOString(), unix: Date.now() })
    });

    // search-memory: find notes in AI Space local memory
    this.registerTool({
      name: 'search_memory',
      description: 'Search locally stored notes, quick captures, and shared content.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search terms' }
        },
        required: ['query']
      },
      permissions: [],
      execute: async ({ query }, ctx) => {
        if (!ctx?.memory) return { found: false, items: [], reason: 'Memory not available' };
        try {
          const items = await ctx.memory.getSharedContent();
          const q = String(query || '').toLowerCase();
          const matches = items.filter((item) => {
            const text = [item.text, item.title, item.type, item.source]
              .filter(Boolean).join(' ').toLowerCase();
            return text.includes(q);
          });
          return {
            found: matches.length > 0,
            count: matches.length,
            items: matches.slice(0, 5).map((i) => ({
              type: i.type,
              text: (i.text || '').slice(0, 300),
              createdAt: i.createdAt
            }))
          };
        } catch (e) {
          return { found: false, items: [], reason: e.message };
        }
      }
    });
  }
}

// ─── Re-export RuntimeAgent for backward compatibility ───────────────────────

export { RuntimeAgent };
