/**
 * Route: /api/chat
 *
 * POST /api/chat — OpenAI-compatible chat-completions endpoint.
 *
 * Accepts the same JSON body as the OpenAI /v1/chat/completions API:
 *   { model, messages, stream, temperature, max_tokens, ... }
 *
 * When stream=true: emits Server-Sent Events with `data: <json>` lines.
 * When stream=false: returns a single JSON response object.
 *
 * Internally proxies to Ollama's /api/chat endpoint with KV context caching.
 */

import { createLogger } from '../logger.js';
import { kvStore } from '../kv-store.js';

const log = createLogger('route:chat');

const OLLAMA_HOST = (process.env.OLLAMA_HOST || 'http://ollama:11434').replace(/\/+$/, '');
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'gemma3:4b';

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export async function handleChat(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const body = await readBody(req);
  const {
    model = DEFAULT_MODEL,
    messages,
    stream = false,
    temperature = 0.55,
    max_tokens,
    conversation_id
  } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return json(res, 400, { error: 'messages array required' });
  }

  // Validate model ID
  if (!/^[a-zA-Z0-9:._/-]{1,200}$/.test(model)) {
    return json(res, 400, { error: 'invalid model id' });
  }

  // Look up cached KV context for this conversation
  const cachedContext = conversation_id
    ? kvStore.get(model, conversation_id)
    : null;

  // Build Ollama request
  const ollamaBody = {
    model,
    messages,
    stream: true, // always stream from Ollama for SSE forwarding
    options: {
      temperature,
      ...(max_tokens ? { num_predict: max_tokens } : {})
    },
    ...(cachedContext ? { context: cachedContext } : {})
  };

  let ollamaRes;
  try {
    ollamaRes = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaBody),
      signal: AbortSignal.timeout(300_000) // 5 min hard timeout
    });
  } catch (err) {
    log.error({ err }, 'Ollama unreachable');
    return json(res, 502, { error: 'Ollama unreachable', detail: err.message });
  }

  if (!ollamaRes.ok) {
    const txt = await ollamaRes.text().catch(() => '');
    log.error({ status: ollamaRes.status, txt }, 'Ollama error');
    return json(res, 502, { error: 'Ollama error', detail: txt });
  }

  const reader = ollamaRes.body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';
  let finalContext = null;

  if (stream) {
    // ── SSE streaming ────────────────────────────────────────────────────────
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        for (const line of text.split('\n')) {
          const t = line.trim();
          if (!t) continue;
          try {
            const parsed = JSON.parse(t);
            const delta = parsed.message?.content || '';
            if (delta) {
              fullResponse += delta;
              // Emit OpenAI-compatible SSE chunk
              const chunk = openAIChunk(model, delta);
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }
            if (parsed.context) finalContext = parsed.context;
            if (parsed.done) {
              res.write(`data: [DONE]\n\n`);
            }
          } catch {}
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Persist KV context if conversation_id provided
    if (conversation_id && finalContext) {
      kvStore.set(model, conversation_id, finalContext).catch(() => {});
    }

    res.end();
  } else {
    // ── Non-streaming ────────────────────────────────────────────────────────
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split('\n')) {
          const t = line.trim();
          if (!t) continue;
          try {
            const parsed = JSON.parse(t);
            fullResponse += parsed.message?.content || '';
            if (parsed.context) finalContext = parsed.context;
          } catch {}
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (conversation_id && finalContext) {
      kvStore.set(model, conversation_id, finalContext).catch(() => {});
    }

    json(res, 200, openAIResponse(model, fullResponse));
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function openAIChunk(model, delta) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion.chunk',
    model,
    choices: [{ index: 0, delta: { content: delta }, finish_reason: null }]
  };
}

function openAIResponse(model, content) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop'
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  };
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 4_194_304) req.destroy(new Error('Body too large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}
