/**
 * RuntimeAgent - local-first background mini runtime using Web Workers.
 * Executes restricted scripts without blocking the UI thread.
 */

export class RuntimeAgent {
  constructor() {
    this.activeJobs = new Map();
  }

  static getPresets() {
    return [
      {
        id: 'health-check',
        name: 'Health Check (Site + API)',
        script: [
          "LOG Checking site and API status...",
          "RUN fetch https://mjraraujo.github.io/ai-space/ -> site",
          "LOG Site status: {{site.status}}",
          "RUN json https://api.github.com/repos/mjraraujo/ai-space/actions/runs?per_page=1 -> api",
          "LOG GitHub API status: {{api.status}}",
          "LOG Latest deploy: {{api.data.workflow_runs.0.status}} | {{api.data.workflow_runs.0.conclusion}}",
          "RETURNJSON {\"done\":true}"
        ].join('\n')
      },
      {
        id: 'relay-artifact',
        name: 'Relay Artifact Builder',
        script: [
          "LOG Building Relay artifact skeleton...",
          "RETURNJSON {\"relay\":\"browser\",\"action\":\"web_extract\",\"target\":\"https://mjraraujo.github.io/ai-space/\",\"instruction\":\"Capture visible hero and summarize changes\"}"
        ].join('\n')
      },
      {
        id: 'navigate-flow',
        name: 'Navigate + Wait Flow',
        script: [
          "NAVIGATE https://mjraraujo.github.io/ai-space/",
          "WAIT 1500",
          "LOG Navigation request sent. Continue with manual snapshot in your browser relay.",
          "RETURNJSON {\"requested\":\"browser_navigate\"}"
        ].join('\n')
      }
    ];
  }

  run(script, handlers = {}, options = {}) {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const worker = this._createWorker();
    const trusted = options?.runtimeMode === 'trusted';

    const safeHandlers = {
      onLog: typeof handlers.onLog === 'function' ? handlers.onLog : () => {},
      onStatus: typeof handlers.onStatus === 'function' ? handlers.onStatus : () => {},
      onDone: typeof handlers.onDone === 'function' ? handlers.onDone : () => {},
      onError: typeof handlers.onError === 'function' ? handlers.onError : () => {}
    };

    this.activeJobs.set(jobId, { worker, safeHandlers, startedAt: Date.now() });
    safeHandlers.onStatus({ jobId, status: 'running' });

    worker.onmessage = (event) => {
      const msg = event.data || {};
      const active = this.activeJobs.get(jobId);
      if (!active) return;

      if (msg.type === 'log') {
        safeHandlers.onLog({ jobId, text: msg.text || '' });
        return;
      }

      if (msg.type === 'tool:navigate') {
        safeHandlers.onStatus({ jobId, status: 'navigate', url: msg.url || '' });
        return;
      }

      if (msg.type === 'done') {
        safeHandlers.onDone({ jobId, result: msg.result, durationMs: Date.now() - active.startedAt });
        worker.terminate();
        this.activeJobs.delete(jobId);
        return;
      }

      if (msg.type === 'error') {
        safeHandlers.onError({ jobId, error: msg.error || 'Unknown runtime error' });
        worker.terminate();
        this.activeJobs.delete(jobId);
      }
    };

    worker.onerror = (err) => {
      const active = this.activeJobs.get(jobId);
      if (!active) return;
      safeHandlers.onError({ jobId, error: err?.message || 'Worker crashed' });
      worker.terminate();
      this.activeJobs.delete(jobId);
    };

    worker.postMessage({ type: 'run', jobId, script: script || '', trusted });

    return jobId;
  }

  cancel(jobId) {
    const active = this.activeJobs.get(jobId);
    if (!active) return false;
    active.worker.terminate();
    this.activeJobs.delete(jobId);
    active.safeHandlers.onStatus({ jobId, status: 'cancelled' });
    return true;
  }

  _createWorker() {
    const workerCode = `
      const MAX_OUTPUT = 24000;
      const MAX_SCRIPT_LINES = 200;
      const MAX_LINE_LENGTH = 1200;
      const MAX_JOB_MS = 90000;
      const MAX_LOG_LINE = 1200;

      function truncate(text) {
        const str = String(text ?? '');
        return str.length > MAX_OUTPUT ? str.slice(0, MAX_OUTPUT) + '\\n...truncated...' : str;
      }

      function truncateLog(text) {
        const str = String(text ?? '');
        return str.length > MAX_LOG_LINE ? str.slice(0, MAX_LOG_LINE) + '...truncated...' : str;
      }

      function parseArgs(input) {
        const out = [];
        let cur = '';
        let quote = '';

        for (let i = 0; i < input.length; i++) {
          const ch = input[i];

          if (quote) {
            if (ch === '\\\\' && i + 1 < input.length) {
              cur += input[i + 1];
              i++;
              continue;
            }
            if (ch === quote) {
              quote = '';
              continue;
            }
            cur += ch;
            continue;
          }

          if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
          }

          if (/\s/.test(ch)) {
            if (cur) {
              out.push(cur);
              cur = '';
            }
            continue;
          }

          cur += ch;
        }

        if (cur) {
          out.push(cur);
        }

        return out;
      }

      function log(text) {
        postMessage({ type: 'log', text: truncateLog(text) });
      }

      function getPath(obj, path) {
        if (!path) return obj;
        const parts = String(path).split('.').filter(Boolean);
        let cur = obj;
        for (const part of parts) {
          if (cur === null || cur === undefined) return '';
          const key = /^\\d+$/.test(part) ? Number(part) : part;
          cur = cur[key];
        }
        return cur === undefined ? '' : cur;
      }

      function interpolate(template, vars) {
        return String(template || '').replace(/\\{\\{\\s*([a-zA-Z0-9_.]+)\\s*\\}\\}/g, (_, key) => {
          const value = getPath(vars, key);
          if (value === null || value === undefined) return '';
          if (typeof value === 'object') return JSON.stringify(value);
          return String(value);
        });
      }

      function parseScript(raw) {
        const lines = String(raw || '')
          .split('\\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#'));

        if (lines.length > MAX_SCRIPT_LINES) {
          throw new Error('Script too large. Maximum ' + MAX_SCRIPT_LINES + ' commands.');
        }

        for (const line of lines) {
          if (line.length > MAX_LINE_LENGTH) {
            throw new Error('A script line is too long.');
          }
        }

        return lines;
      }

      async function runTrustedScript(script) {
        const tools = { log, terminal, browserNavigate };
        const wrapped = "'use strict'; return (async () => {\\n" + String(script || '') + "\\n})();";
        const runner = new Function('tools', wrapped);

        // Best-effort timeout: if script enters a tight sync loop the worker can still be terminated from host.
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Trusted runtime timeout exceeded.')), MAX_JOB_MS);
        });

        return Promise.race([runner(tools), timeoutPromise]);
      }

      async function terminal(command) {
        const raw = String(command || '').trim();
        if (!raw) return { ok: false, error: 'Empty command', output: '' };

        const args = parseArgs(raw);
        const cmd = (args.shift() || '').toLowerCase();

        if (cmd === 'help') {
          return {
            ok: true,
            output: 'Commands: help, now, echo <text>, wait <ms>, fetch <url> [method], json <url>'
          };
        }

        if (cmd === 'now') {
          return { ok: true, output: new Date().toISOString() };
        }

        if (cmd === 'echo') {
          return { ok: true, output: args.join(' ') };
        }

        if (cmd === 'wait') {
          const ms = Math.max(0, Math.min(60000, Number(args[0] || 0)));
          await new Promise((resolve) => setTimeout(resolve, ms));
          return { ok: true, output: 'waited ' + ms + 'ms' };
        }

        if (cmd === 'fetch' || cmd === 'json') {
          const url = args[0];
          const method = (args[1] || 'GET').toUpperCase();
          if (!url) return { ok: false, error: 'Missing URL', output: '' };

          const res = await fetch(url, { method });
          const text = await res.text();

          if (cmd === 'json') {
            let parsed = null;
            try {
              parsed = JSON.parse(text);
            } catch {
              return {
                ok: false,
                status: res.status,
                error: 'Response is not valid JSON',
                output: truncate(text)
              };
            }
            return {
              ok: res.ok,
              status: res.status,
              url: res.url,
              data: parsed,
              output: truncate(JSON.stringify(parsed, null, 2))
            };
          }

          return {
            ok: res.ok,
            status: res.status,
            url: res.url,
            output: truncate(text)
          };
        }

        return { ok: false, error: 'Unsupported command: ' + cmd, output: '' };
      }

      async function browserNavigate(url) {
        if (!url) throw new Error('Missing URL for browserNavigate');
        postMessage({ type: 'tool:navigate', url: String(url) });
        return { ok: true, requested: 'browser_navigate', url: String(url) };
      }

      function parseAssignment(line) {
        const idx = line.lastIndexOf('->');
        if (idx === -1) return { statement: line.trim(), assignTo: null };
        const statement = line.slice(0, idx).trim();
        const assignTo = line.slice(idx + 2).trim();
        if (!assignTo || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(assignTo)) {
          throw new Error('Invalid assignment target in line: ' + line);
        }
        return { statement, assignTo };
      }

      async function runLine(rawLine, vars) {
        const { statement, assignTo } = parseAssignment(rawLine);
        const upper = statement.toUpperCase();

        if (upper.startsWith('LOG ')) {
          const msg = interpolate(statement.slice(4), vars);
          log(msg);
          return null;
        }

        if (upper.startsWith('WAIT ')) {
          const ms = Math.max(0, Math.min(60000, Number(interpolate(statement.slice(5), vars) || 0)));
          await new Promise((resolve) => setTimeout(resolve, ms));
          return { waitedMs: ms };
        }

        if (upper.startsWith('NAVIGATE ')) {
          const url = interpolate(statement.slice(9), vars).trim();
          return browserNavigate(url);
        }

        if (upper.startsWith('RUN ')) {
          const command = interpolate(statement.slice(4), vars).trim();
          const result = await terminal(command);
          if (assignTo) vars[assignTo] = result;
          return result;
        }

        if (upper.startsWith('RETURNJSON ')) {
          const body = interpolate(statement.slice(11), vars).trim();
          let parsed = null;
          try {
            parsed = JSON.parse(body);
          } catch {
            throw new Error('RETURNJSON expects valid JSON object');
          }
          return { __return: true, value: parsed };
        }

        if (upper.startsWith('RETURN ')) {
          const text = interpolate(statement.slice(7), vars);
          return { __return: true, value: text };
        }

        throw new Error('Unsupported command: ' + statement.split(/\\s+/)[0]);
      }

      async function runScript(rawScript) {
        const vars = {};
        const lines = parseScript(rawScript);
        const startedAt = Date.now();
        let lastResult = null;

        for (const line of lines) {
          if (Date.now() - startedAt > MAX_JOB_MS) {
            throw new Error('Runtime timeout exceeded.');
          }
          const result = await runLine(line, vars);
          if (result && result.__return) {
            return result.value;
          }
          if (result !== null && result !== undefined) {
            lastResult = result;
          }
        }

        return {
          done: true,
          lastResult,
          vars
        };
      }

      self.onmessage = async (event) => {
        const msg = event.data || {};
        if (msg.type !== 'run') return;

        const script = String(msg.script || '').trim();
        if (!script) {
          postMessage({ type: 'error', error: 'Script is empty' });
          return;
        }

        try {
          const result = msg.trusted ? await runTrustedScript(script) : await runScript(script);
          postMessage({ type: 'done', result });
        } catch (err) {
          postMessage({ type: 'error', error: err?.message || String(err) });
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url, { type: 'classic' });
    URL.revokeObjectURL(url);
    return worker;
  }
}
