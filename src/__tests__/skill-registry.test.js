import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SkillProvider,
  SkillRegistry,
  WorkflowStudioSkill,
  WebExtractorSkill,
  MorningBriefingSkill,
  ReplyDrafterSkill,
  createDefaultRegistry
} from '../skill-registry.js';

// ─── SkillProvider (base interface) ──────────────────────────────────────────

describe('SkillProvider (base interface)', () => {
  let provider;

  beforeEach(() => {
    provider = new SkillProvider();
  });

  it('getManifest() throws by default', () => {
    expect(() => provider.getManifest()).toThrow('not implemented');
  });

  it('execute() throws by default', async () => {
    await expect(provider.execute('input', {})).rejects.toThrow('not implemented');
  });

  it('onActivate() resolves without error', async () => {
    await expect(provider.onActivate({})).resolves.not.toThrow();
  });

  it('shouldHandle() returns false by default', async () => {
    const result = await provider.shouldHandle('anything', {});
    expect(result).toBe(false);
  });

  it('handleToolCall() returns empty string by default', async () => {
    const result = await provider.handleToolCall({}, {});
    expect(result).toBe('');
  });

  it('onDeactivate() resolves without error', async () => {
    await expect(provider.onDeactivate()).resolves.not.toThrow();
  });
});

// ─── SkillRegistry ────────────────────────────────────────────────────────────

describe('SkillRegistry', () => {
  let registry;

  // Minimal concrete skill for testing
  class TestSkill extends SkillProvider {
    getManifest() {
      return {
        id: 'test-skill',
        name: 'Test Skill',
        version: '1.0.0',
        description: 'For testing',
        icon: '🧪',
        permissions: [],
        tools: [
          {
            type: 'function',
            function: { name: 'test_tool', description: 'A test tool', parameters: {} }
          }
        ]
      };
    }
    async shouldHandle(input) { return input.startsWith('test:'); }
    async execute() { return { content: 'Test skill executed', handled: true }; }
    async handleToolCall() { return 'tool result'; }
  }

  class AnotherSkill extends SkillProvider {
    getManifest() {
      return { id: 'another-skill', name: 'Another', version: '1.0.0', description: 'x', icon: '⚙️', permissions: [] };
    }
    async shouldHandle() { return true; } // always claims input
    async execute() { return { content: 'Another executed', handled: true }; }
  }

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  it('starts with no skills registered', () => {
    expect(registry.size).toBe(0);
  });

  it('register() adds a skill', () => {
    registry.register(new TestSkill());
    expect(registry.size).toBe(1);
  });

  it('resolve() returns registered skill', () => {
    registry.register(new TestSkill());
    const skill = registry.resolve('test-skill');
    expect(skill).toBeInstanceOf(TestSkill);
  });

  it('resolve() returns undefined for unknown id', () => {
    expect(registry.resolve('unknown')).toBeUndefined();
  });

  it('register() throws when manifest has no id', () => {
    class BadSkill extends SkillProvider {
      getManifest() { return { name: 'No ID', version: '1', description: '', icon: '', permissions: [] }; }
    }
    expect(() => registry.register(new BadSkill())).toThrow('must have an id');
  });

  it('listManifests() returns all manifests', () => {
    registry.register(new TestSkill());
    registry.register(new AnotherSkill());
    const manifests = registry.listManifests();
    expect(manifests).toHaveLength(2);
    expect(manifests.map(m => m.id)).toContain('test-skill');
    expect(manifests.map(m => m.id)).toContain('another-skill');
  });

  it('listManifests() includes enabled flag', () => {
    registry.register(new TestSkill());
    const [m] = registry.listManifests();
    expect(m).toHaveProperty('enabled', true);
  });

  it('disable() marks skill as disabled', () => {
    registry.register(new TestSkill());
    registry.disable('test-skill');
    expect(registry.isEnabled('test-skill')).toBe(false);
  });

  it('enable() re-enables a disabled skill', () => {
    registry.register(new TestSkill());
    registry.disable('test-skill');
    registry.enable('test-skill');
    expect(registry.isEnabled('test-skill')).toBe(true);
  });

  it('listEnabled() excludes disabled skills', () => {
    registry.register(new TestSkill());
    registry.register(new AnotherSkill());
    registry.disable('test-skill');
    const enabled = registry.listEnabled();
    expect(enabled.map(m => m.id)).not.toContain('test-skill');
    expect(enabled.map(m => m.id)).toContain('another-skill');
  });

  it('isEnabled() returns false for unknown skill', () => {
    expect(registry.isEnabled('does-not-exist')).toBe(false);
  });

  it('unregister() removes the skill', async () => {
    registry.register(new TestSkill());
    await registry.unregister('test-skill');
    expect(registry.size).toBe(0);
  });

  it('unregister() is safe when skill does not exist', async () => {
    await expect(registry.unregister('ghost')).resolves.not.toThrow();
  });

  it('route() returns the first matching enabled skill', async () => {
    registry.register(new TestSkill());
    const ctx = { conversationId: 'c1', messages: [] };
    const skill = await registry.route('test: hello', ctx);
    expect(skill).toBeInstanceOf(TestSkill);
  });

  it('route() returns null when no skill matches', async () => {
    registry.register(new TestSkill()); // only matches 'test:' prefix
    const ctx = {};
    const skill = await registry.route('completely unrelated message', ctx);
    expect(skill).toBeNull();
  });

  it('route() skips disabled skills', async () => {
    registry.register(new AnotherSkill()); // always matches
    registry.disable('another-skill');
    const skill = await registry.route('anything', {});
    expect(skill).toBeNull();
  });

  it('collectToolDefs() collects from all enabled skills', () => {
    registry.register(new TestSkill());
    const defs = registry.collectToolDefs();
    expect(defs).toHaveLength(1);
    expect(defs[0].function.name).toBe('test_tool');
  });

  it('collectToolDefs() excludes disabled skills', () => {
    registry.register(new TestSkill());
    registry.disable('test-skill');
    const defs = registry.collectToolDefs();
    expect(defs).toHaveLength(0);
  });

  it('dispatchToolCall() routes to the owning skill', async () => {
    registry.register(new TestSkill());
    const result = await registry.dispatchToolCall(
      { id: 'tc1', type: 'function', function: { name: 'test_tool', arguments: '{}' } },
      {}
    );
    expect(result).toBe('tool result');
  });

  it('dispatchToolCall() returns error string for unknown tool', async () => {
    registry.register(new TestSkill());
    const result = await registry.dispatchToolCall(
      { id: 'tc2', type: 'function', function: { name: 'unknown_tool', arguments: '{}' } },
      {}
    );
    expect(result).toContain('unknown_tool');
  });
});

// ─── Built-in skills ──────────────────────────────────────────────────────────

describe('WorkflowStudioSkill', () => {
  let skill;

  beforeEach(() => { skill = new WorkflowStudioSkill(); });

  it('getManifest() has correct id', () => {
    expect(skill.getManifest().id).toBe('workflow-studio');
  });

  it('getManifest() has approvalRequired=true', () => {
    expect(skill.getManifest().approvalRequired).toBe(true);
  });

  it('shouldHandle() matches "create a skill"', async () => {
    expect(await skill.shouldHandle('create a skill for planning')).toBe(true);
  });

  it('shouldHandle() matches "build a workflow"', async () => {
    expect(await skill.shouldHandle('build a workflow')).toBe(true);
  });

  it('shouldHandle() matches "workflow studio"', async () => {
    expect(await skill.shouldHandle('open workflow studio')).toBe(true);
  });

  it('shouldHandle() returns false for unrelated input', async () => {
    expect(await skill.shouldHandle('what is the weather today')).toBe(false);
  });

  it('execute() returns a SkillResult with artifact', async () => {
    const result = await skill.execute('create a skill for morning review', {});
    expect(result).toHaveProperty('artifact');
    expect(result.artifact.type).toBe('skill-manifest');
  });

  it('manifest has systemPrompt with AI Space identity constraints', () => {
    const manifest = skill.getManifest();
    expect(manifest.systemPrompt).toContain('AI Space Workflow Studio');
    expect(manifest.systemPrompt).toContain('local-first');
    expect(manifest.systemPrompt).toContain('approval-based');
  });
});

describe('WebExtractorSkill', () => {
  let skill;
  beforeEach(() => { skill = new WebExtractorSkill(); });

  it('has correct id', () => {
    expect(skill.getManifest().id).toBe('web-extractor');
  });

  it('shouldHandle() matches a URL', async () => {
    expect(await skill.shouldHandle('check https://example.com for me')).toBe(true);
  });

  it('shouldHandle() matches "summarize this article"', async () => {
    expect(await skill.shouldHandle('summarize this article from the site')).toBe(true);
  });

  it('shouldHandle() returns false for chat', async () => {
    expect(await skill.shouldHandle('how are you today?')).toBe(false);
  });

  it('execute() returns artifact with url when URL is in input', async () => {
    const result = await skill.execute('read https://example.com please', {});
    expect(result.artifact?.url).toBe('https://example.com');
  });
});

describe('MorningBriefingSkill', () => {
  let skill;
  beforeEach(() => { skill = new MorningBriefingSkill(); });

  it('has correct id', () => {
    expect(skill.getManifest().id).toBe('morning-briefing');
  });

  it('shouldHandle() matches "morning briefing"', async () => {
    expect(await skill.shouldHandle('give me a morning briefing')).toBe(true);
  });

  it('shouldHandle() matches "brief me"', async () => {
    expect(await skill.shouldHandle('brief me about today')).toBe(true);
  });

  it('shouldHandle() returns false for unrelated input', async () => {
    expect(await skill.shouldHandle('what is 2+2')).toBe(false);
  });
});

describe('ReplyDrafterSkill', () => {
  let skill;
  beforeEach(() => { skill = new ReplyDrafterSkill(); });

  it('has correct id', () => {
    expect(skill.getManifest().id).toBe('reply-drafter');
  });

  it('shouldHandle() matches "draft a reply"', async () => {
    expect(await skill.shouldHandle('draft a reply to this email')).toBe(true);
  });

  it('shouldHandle() matches "reply to"', async () => {
    expect(await skill.shouldHandle('reply to this message for me')).toBe(true);
  });

  it('shouldHandle() returns false for greetings', async () => {
    expect(await skill.shouldHandle('hello how are you')).toBe(false);
  });
});

// ─── createDefaultRegistry() ──────────────────────────────────────────────────

describe('createDefaultRegistry()', () => {
  it('returns a SkillRegistry with 4 built-in skills', () => {
    const registry = createDefaultRegistry();
    expect(registry.size).toBe(4);
  });

  it('includes workflow-studio', () => {
    const registry = createDefaultRegistry();
    expect(registry.resolve('workflow-studio')).toBeInstanceOf(WorkflowStudioSkill);
  });

  it('includes web-extractor', () => {
    const registry = createDefaultRegistry();
    expect(registry.resolve('web-extractor')).toBeInstanceOf(WebExtractorSkill);
  });

  it('includes morning-briefing', () => {
    const registry = createDefaultRegistry();
    expect(registry.resolve('morning-briefing')).toBeInstanceOf(MorningBriefingSkill);
  });

  it('includes reply-drafter', () => {
    const registry = createDefaultRegistry();
    expect(registry.resolve('reply-drafter')).toBeInstanceOf(ReplyDrafterSkill);
  });

  it('all skills start enabled', () => {
    const registry = createDefaultRegistry();
    const manifests = registry.listManifests();
    expect(manifests.every(m => m.enabled)).toBe(true);
  });
});
