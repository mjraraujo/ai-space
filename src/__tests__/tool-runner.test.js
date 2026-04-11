import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRunner, isPrivateUrl } from '../tool-runner.js';

describe('ToolRunner', () => {
  let runner;

  beforeEach(() => {
    runner = new ToolRunner();
  });

  // ─── Backward compat: RuntimeAgent still works ────────────────────────────

  describe('inherits RuntimeAgent', () => {
    it('has activeJobs Map', () => {
      expect(runner.activeJobs).toBeInstanceOf(Map);
      expect(runner.activeJobs.size).toBe(0);
    });

    it('cancel() returns false for unknown job', () => {
      expect(runner.cancel('nonexistent')).toBe(false);
    });

    it('getPresets() still returns 4 presets', () => {
      expect(ToolRunner.getPresets()).toHaveLength(4);
    });

    it('getPresets() includes health-check', () => {
      const ids = ToolRunner.getPresets().map(p => p.id);
      expect(ids).toContain('health-check');
    });
  });

  // ─── Tool Registration ────────────────────────────────────────────────────

  describe('registerTool()', () => {
    it('registers a named tool', () => {
      runner.registerTool({
        name: 'ping',
        description: 'Pings',
        parameters: { type: 'object', properties: {} },
        execute: async () => 'pong'
      });
      expect(runner.hasTool('ping')).toBe(true);
    });

    it('throws when name is missing', () => {
      expect(() => runner.registerTool({ description: 'no name' })).toThrow();
    });

    it('overwrites existing tool with same name', () => {
      runner.registerTool({ name: 'tool', description: 'v1', parameters: {}, execute: async () => 'v1' });
      runner.registerTool({ name: 'tool', description: 'v2', parameters: {}, execute: async () => 'v2' });
      expect(runner.hasTool('tool')).toBe(true);
    });
  });

  describe('unregisterTool()', () => {
    it('removes the tool', () => {
      runner.registerTool({ name: 'tool', description: 'x', parameters: {}, execute: async () => {} });
      runner.unregisterTool('tool');
      expect(runner.hasTool('tool')).toBe(false);
    });

    it('is safe when tool does not exist', () => {
      expect(() => runner.unregisterTool('ghost')).not.toThrow();
    });
  });

  describe('hasTool()', () => {
    it('returns false initially', () => {
      expect(runner.hasTool('anything')).toBe(false);
    });
  });

  // ─── getToolDefs() ────────────────────────────────────────────────────────

  describe('getToolDefs()', () => {
    it('returns empty array initially', () => {
      expect(runner.getToolDefs()).toEqual([]);
    });

    it('returns OpenAI-format tool definitions', () => {
      runner.registerTool({
        name: 'my_tool',
        description: 'Does something',
        parameters: { type: 'object', properties: { x: { type: 'string' } } },
        execute: async () => {}
      });
      const defs = runner.getToolDefs();
      expect(defs).toHaveLength(1);
      expect(defs[0].type).toBe('function');
      expect(defs[0].function.name).toBe('my_tool');
      expect(defs[0].function.description).toBe('Does something');
      expect(defs[0].function.parameters).toBeDefined();
    });

    it('returns defs for all registered tools', () => {
      runner.registerTool({ name: 'a', description: 'A', parameters: {}, execute: async () => {} });
      runner.registerTool({ name: 'b', description: 'B', parameters: {}, execute: async () => {} });
      expect(runner.getToolDefs()).toHaveLength(2);
    });
  });

  // ─── executeToolCall() ────────────────────────────────────────────────────

  describe('executeToolCall()', () => {
    it('executes a registered tool and returns ok result', async () => {
      runner.registerTool({
        name: 'add',
        description: 'Add two numbers',
        parameters: { type: 'object', properties: { a: {}, b: {} } },
        execute: async ({ a, b }) => a + b
      });

      const result = await runner.executeToolCall({
        id: 'tc1',
        type: 'function',
        function: { name: 'add', arguments: JSON.stringify({ a: 2, b: 3 }) }
      });

      expect(result.ok).toBe(true);
      expect(result.output).toBe(5);
      expect(result.toolName).toBe('add');
      expect(result.callId).toBe('tc1');
      expect(typeof result.durationMs).toBe('number');
    });

    it('returns error result for unknown tool', async () => {
      const result = await runner.executeToolCall({
        id: 'tc2',
        type: 'function',
        function: { name: 'nonexistent', arguments: '{}' }
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('nonexistent');
    });

    it('returns error result for invalid JSON arguments', async () => {
      runner.registerTool({ name: 'tool', description: '', parameters: {}, execute: async () => {} });
      const result = await runner.executeToolCall({
        id: 'tc3',
        type: 'function',
        function: { name: 'tool', arguments: 'not-json' }
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });

    it('returns error result when tool throws', async () => {
      runner.registerTool({
        name: 'fail',
        description: '',
        parameters: {},
        execute: async () => { throw new Error('tool crashed'); }
      });
      const result = await runner.executeToolCall({
        id: 'tc4',
        type: 'function',
        function: { name: 'fail', arguments: '{}' }
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('tool crashed');
    });

    it('generates a callId when none provided', async () => {
      runner.registerTool({ name: 'noop', description: '', parameters: {}, execute: async () => null });
      const result = await runner.executeToolCall({
        type: 'function',
        function: { name: 'noop', arguments: '{}' }
      });
      expect(result.callId).toBeTruthy();
    });

    it('records durationMs', async () => {
      runner.registerTool({ name: 'slow', description: '', parameters: {}, execute: async () => { await new Promise(r => setTimeout(r, 10)); return 'done'; } });
      const result = await runner.executeToolCall({
        id: 'tc5',
        type: 'function',
        function: { name: 'slow', arguments: '{}' }
      });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── executeToolCalls() ───────────────────────────────────────────────────

  describe('executeToolCalls()', () => {
    it('executes multiple calls in order', async () => {
      const order = [];
      runner.registerTool({ name: 'a', description: '', parameters: {}, execute: async () => { order.push('a'); return 'a'; } });
      runner.registerTool({ name: 'b', description: '', parameters: {}, execute: async () => { order.push('b'); return 'b'; } });

      const results = await runner.executeToolCalls([
        { id: '1', type: 'function', function: { name: 'a', arguments: '{}' } },
        { id: '2', type: 'function', function: { name: 'b', arguments: '{}' } }
      ]);

      expect(results).toHaveLength(2);
      expect(order).toEqual(['a', 'b']);
      expect(results[0].output).toBe('a');
      expect(results[1].output).toBe('b');
    });

    it('returns results for each call even if one fails', async () => {
      runner.registerTool({ name: 'ok', description: '', parameters: {}, execute: async () => 'ok' });
      runner.registerTool({ name: 'bad', description: '', parameters: {}, execute: async () => { throw new Error('fail'); } });

      const results = await runner.executeToolCalls([
        { id: '1', type: 'function', function: { name: 'ok', arguments: '{}' } },
        { id: '2', type: 'function', function: { name: 'bad', arguments: '{}' } }
      ]);

      expect(results[0].ok).toBe(true);
      expect(results[1].ok).toBe(false);
    });
  });

  // ─── toolResultsToMessages() ──────────────────────────────────────────────

  describe('ToolRunner.toolResultsToMessages()', () => {
    it('converts ok results to tool messages', () => {
      const msgs = ToolRunner.toolResultsToMessages([
        { callId: 'c1', toolName: 'my_tool', ok: true, output: { result: 42 }, durationMs: 5 }
      ]);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].role).toBe('tool');
      expect(msgs[0].name).toBe('my_tool');
      expect(msgs[0].content).toContain('42');
    });

    it('converts error results to error messages', () => {
      const msgs = ToolRunner.toolResultsToMessages([
        { callId: 'c2', toolName: 'bad', ok: false, error: 'it crashed', durationMs: 1 }
      ]);
      expect(msgs[0].content).toContain('Error');
      expect(msgs[0].content).toContain('it crashed');
    });

    it('handles string output directly', () => {
      const msgs = ToolRunner.toolResultsToMessages([
        { callId: 'c3', toolName: 'echo', ok: true, output: 'plain text', durationMs: 1 }
      ]);
      expect(msgs[0].content).toBe('plain text');
    });

    it('returns empty array for empty input', () => {
      expect(ToolRunner.toolResultsToMessages([])).toEqual([]);
    });
  });

  // ─── Built-in tools ───────────────────────────────────────────────────────

  describe('registerBuiltIns()', () => {
    it('registers fetch_url, get_timestamp, search_memory tools', () => {
      runner.registerBuiltIns();
      expect(runner.hasTool('fetch_url')).toBe(true);
      expect(runner.hasTool('get_timestamp')).toBe(true);
      expect(runner.hasTool('search_memory')).toBe(true);
    });

    it('get_timestamp returns an iso string and unix timestamp', async () => {
      runner.registerBuiltIns();
      const result = await runner.executeToolCall({
        id: 'ts1',
        type: 'function',
        function: { name: 'get_timestamp', arguments: '{}' }
      });
      expect(result.ok).toBe(true);
      expect(result.output).toHaveProperty('iso');
      expect(result.output).toHaveProperty('unix');
      expect(typeof result.output.iso).toBe('string');
      expect(typeof result.output.unix).toBe('number');
    });

    it('search_memory returns found:false when no memory in ctx', async () => {
      runner.registerBuiltIns();
      const result = await runner.executeToolCall(
        { id: 'sm1', type: 'function', function: { name: 'search_memory', arguments: '{"query":"test"}' } },
        {} // no memory
      );
      expect(result.ok).toBe(true);
      expect(result.output.found).toBe(false);
    });

    it('search_memory searches memory items when ctx.memory is provided', async () => {
      runner.registerBuiltIns();
      const mockMemory = {
        getSharedContent: vi.fn().mockResolvedValue([
          { type: 'quick-note', text: 'my test note', source: 'user', createdAt: Date.now() }
        ])
      };
      const result = await runner.executeToolCall(
        { id: 'sm2', type: 'function', function: { name: 'search_memory', arguments: '{"query":"test note"}' } },
        { memory: mockMemory }
      );
      expect(result.ok).toBe(true);
      expect(result.output.found).toBe(true);
      expect(result.output.count).toBe(1);
    });

    it('all built-in tools produce getToolDefs entries', () => {
      runner.registerBuiltIns();
      const defs = runner.getToolDefs();
      expect(defs.length).toBeGreaterThanOrEqual(3);
      defs.forEach(def => {
        expect(def.type).toBe('function');
        expect(def.function.name).toBeTruthy();
        expect(def.function.description).toBeTruthy();
      });
    });
  });
});

describe('isPrivateUrl()', () => {
  it('blocks localhost', () => {
    expect(isPrivateUrl('http://localhost/api')).toBe(true);
  });

  it('blocks localhost subdomains', () => {
    expect(isPrivateUrl('http://api.localhost/')).toBe(true);
  });

  it('blocks loopback 127.0.0.1', () => {
    expect(isPrivateUrl('http://127.0.0.1/secret')).toBe(true);
  });

  it('blocks full 127.x.x.x range', () => {
    expect(isPrivateUrl('http://127.255.0.1/')).toBe(true);
  });

  it('blocks RFC-1918 10.x.x.x', () => {
    expect(isPrivateUrl('http://10.0.0.1/')).toBe(true);
    expect(isPrivateUrl('http://10.255.255.255/')).toBe(true);
  });

  it('blocks RFC-1918 172.16-31.x.x', () => {
    expect(isPrivateUrl('http://172.16.0.1/')).toBe(true);
    expect(isPrivateUrl('http://172.31.255.255/')).toBe(true);
  });

  it('does not block 172.15.x.x (outside private range)', () => {
    expect(isPrivateUrl('https://172.15.0.1/')).toBe(false);
  });

  it('blocks RFC-1918 192.168.x.x', () => {
    expect(isPrivateUrl('http://192.168.1.1/')).toBe(true);
  });

  it('blocks link-local 169.254.x.x', () => {
    expect(isPrivateUrl('http://169.254.169.254/latest/meta-data/')).toBe(true);
  });

  it('blocks IPv6 loopback [::1]', () => {
    expect(isPrivateUrl('http://[::1]/path')).toBe(true);
  });

  it('blocks IPv6 link-local fe80::', () => {
    expect(isPrivateUrl('http://[fe80::1]/')).toBe(true);
  });

  it('blocks file:// scheme', () => {
    expect(isPrivateUrl('file:///etc/passwd')).toBe(true);
  });

  it('blocks data: scheme', () => {
    expect(isPrivateUrl('data:text/plain,hello')).toBe(true);
  });

  it('blocks malformed URLs', () => {
    expect(isPrivateUrl('not-a-url')).toBe(true);
    expect(isPrivateUrl('')).toBe(true);
  });

  it('allows public HTTP URL', () => {
    expect(isPrivateUrl('http://example.com/')).toBe(false);
  });

  it('allows public HTTPS URL', () => {
    expect(isPrivateUrl('https://api.openai.com/v1/chat/completions')).toBe(false);
  });
});
