/**
 * ai-router.ts
 *
 * Multi-provider AI router with automatic fallback:
 *   1. Groq        (primary  — fastest, 30 req/min per free tier)
 *   2. Cerebras    (secondary — 1M tokens/day)
 *   3. Mistral     (tertiary  — 1B tokens/month)
 *   4. Ollama/Llama3.2 (offline fallback — unlimited, local)
 *
 * All cloud providers expose an OpenAI-compatible streaming API, so the
 * response body returned here is always an SSE stream of
 * `data: {"choices":[{"delta":{"content":"..."}}]}\n\n` chunks — identical
 * to what the existing Groq streaming code in ai-routes.ts expects.
 */

import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

type FetchResponse = Awaited<ReturnType<typeof fetch>>;

// ─── Provider configurations ──────────────────────────────────────────────────
interface ProviderConfig {
  name: string;
  baseUrl: string;
  getApiKey: () => string | null;
  models: string[];
  /** Rate-limit window in ms */
  windowMs: number;
  /** Max requests in the window */
  maxRequests: number;
  /** Estimated max tokens per day/window */
  maxTokens?: number;
}

const PROVIDERS: ProviderConfig[] = [
  {
    name: "groq",
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    getApiKey: () => process.env.GROQ_API_KEY ?? null,
    // Active Groq models as of 2026 — DO NOT add decommissioned ones
    models: [
      "llama-3.1-8b-instant",
      "llama-3.3-70b-versatile",
      "gemma2-9b-it",
      "llama-3.2-3b-preview",
    ],
    windowMs: 60 * 1000,      // 1 minute
    maxRequests: 28,           // Groq free: 30/min, use 28 to be safe
  },
  {
    name: "cerebras",
    baseUrl: "https://api.cerebras.ai/v1/chat/completions",
    getApiKey: () => process.env.CEREBRAS_API_KEY ?? null,
    models: ["llama3.1-8b", "llama-3.3-70b"],
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    maxRequests: 10_000,            // generous, tokens are the real constraint
    maxTokens: 950_000,             // 1M tokens/day limit, use 950K to be safe
  },
  {
    name: "mistral",
    baseUrl: "https://api.mistral.ai/v1/chat/completions",
    getApiKey: () => process.env.MISTRAL_API_KEY ?? null,
    models: ["mistral-small-latest", "open-mistral-nemo"],
    windowMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    maxRequests: 100_000,                 // generous
    maxTokens: 990_000_000,              // 1B tokens/month, use 990M to be safe
  },
];

// ─── Per-provider rate-limit state ───────────────────────────────────────────
interface RateLimitState {
  requests: number;
  tokens: number;
  windowStart: number;
  /** Whether this provider is temporarily blocked (e.g. 401, unknown error) */
  blocked: boolean;
  blockUntil: number;
}

const providerState = new Map<string, RateLimitState>();

function getState(name: string): RateLimitState {
  if (!providerState.has(name)) {
    providerState.set(name, {
      requests: 0,
      tokens: 0,
      windowStart: Date.now(),
      blocked: false,
      blockUntil: 0,
    });
  }
  return providerState.get(name)!;
}

function resetIfExpired(cfg: ProviderConfig, state: RateLimitState): void {
  const now = Date.now();
  if (now - state.windowStart >= cfg.windowMs) {
    state.requests = 0;
    state.tokens = 0;
    state.windowStart = now;
  }
}

function isAvailable(cfg: ProviderConfig): boolean {
  const key = cfg.getApiKey();
  if (!key) return false;
  const state = getState(cfg.name);
  resetIfExpired(cfg, state);
  if (state.blocked && Date.now() < state.blockUntil) return false;
  if (state.requests >= cfg.maxRequests) return false;
  if (cfg.maxTokens && state.tokens >= cfg.maxTokens) return false;
  return true;
}

function recordUsage(name: string, estimatedTokens: number): void {
  const state = getState(name);
  state.requests += 1;
  state.tokens += estimatedTokens;
}

function blockProvider(name: string, durationMs: number, reason: string): void {
  const state = getState(name);
  state.blocked = true;
  state.blockUntil = Date.now() + durationMs;
  console.warn(`[ai-router] provider "${name}" blocked for ${Math.round(durationMs / 1000)}s — ${reason}`);
}

// ─── Round-robin index per provider (for model rotation) ─────────────────────
const modelIndex = new Map<string, number>();

function nextModel(cfg: ProviderConfig): string {
  const idx = (modelIndex.get(cfg.name) ?? 0) % cfg.models.length;
  modelIndex.set(cfg.name, idx + 1);
  return cfg.models[idx];
}

// ─── Ollama local service ─────────────────────────────────────────────────────
const OLLAMA_MODEL = "llama3.2:3b";
const OLLAMA_BASE_URL = "http://127.0.0.1:11434";
let ollamaProcess: ChildProcess | null = null;
let ollamaReady = false;
let ollamaModelReady = false;

function findOllamaBinary(): string | null {
  const candidates = [
    "/usr/bin/ollama",
    "/usr/local/bin/ollama",
    "/nix/var/nix/profiles/default/bin/ollama",
    `${process.env.HOME}/.nix-profile/bin/ollama`,
    `${process.env.HOME}/.ollama-bin/ollama`,
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  // Try PATH
  try {
    const { execSync } = require("child_process");
    const which = execSync("which ollama 2>/dev/null", { encoding: "utf8" }).trim();
    if (which) return which;
  } catch {}
  return null;
}

async function waitForOllamaReady(timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function pullOllamaModel(): Promise<boolean> {
  try {
    console.log(`[ai-router][ollama] pulling model ${OLLAMA_MODEL} (this may take a few minutes on first run)…`);
    const res = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: OLLAMA_MODEL, stream: false }),
      signal: AbortSignal.timeout(10 * 60 * 1000), // 10 min for large model
    });
    if (res.ok) {
      console.log(`[ai-router][ollama] model ${OLLAMA_MODEL} is ready`);
      return true;
    }
    const body = await res.text();
    console.warn(`[ai-router][ollama] pull failed HTTP ${res.status}: ${body.slice(0, 200)}`);
    return false;
  } catch (err: any) {
    console.warn(`[ai-router][ollama] pull error: ${err.message}`);
    return false;
  }
}

export async function initOllama(): Promise<void> {
  const bin = findOllamaBinary();
  if (!bin) {
    console.log("[ai-router][ollama] binary not found — offline fallback disabled");
    return;
  }
  console.log(`[ai-router][ollama] found binary at ${bin}`);

  // Check if Ollama is already running
  try {
    const probe = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (probe.ok) {
      console.log("[ai-router][ollama] service already running");
      ollamaReady = true;
      ollamaModelReady = await pullOllamaModel();
      return;
    }
  } catch {}

  // Start Ollama serve in background
  console.log("[ai-router][ollama] starting ollama serve…");
  ollamaProcess = spawn(bin, ["serve"], {
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      OLLAMA_HOST: "127.0.0.1:11434",
      OLLAMA_MODELS: path.join(process.env.HOME ?? "/tmp", ".ollama/models"),
    },
  });

  ollamaProcess.stdout?.on("data", (d) =>
    console.log(`[ollama] ${d.toString().trim()}`)
  );
  ollamaProcess.stderr?.on("data", (d) =>
    console.error(`[ollama] ${d.toString().trim()}`)
  );
  ollamaProcess.on("exit", (code) => {
    console.log(`[ai-router][ollama] process exited with code ${code}`);
    ollamaReady = false;
    ollamaProcess = null;
  });

  ollamaReady = await waitForOllamaReady(30_000);
  if (!ollamaReady) {
    console.warn("[ai-router][ollama] service did not start in time — offline fallback disabled");
    return;
  }
  console.log("[ai-router][ollama] service ready");

  // Pull model asynchronously so it doesn't block server startup
  pullOllamaModel().then((ok) => {
    ollamaModelReady = ok;
  });
}

/** Gracefully stop the Ollama child process when the server shuts down */
export function stopOllama(): void {
  if (ollamaProcess) {
    ollamaProcess.kill("SIGTERM");
    ollamaProcess = null;
  }
}

// ─── Ollama streaming call ─────────────────────────────────────────────────────
async function callOllama(
  messages: AIMessage[],
  maxTokens: number,
  requestId: string
): Promise<FetchResponse> {
  if (!ollamaReady || !ollamaModelReady) {
    throw Object.assign(new Error("Ollama offline fallback not ready"), { statusCode: 503 });
  }
  console.log(`[ai-router][${requestId}] calling Ollama model=${OLLAMA_MODEL}`);

  const res = await fetch(`${OLLAMA_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      max_tokens: maxTokens,
      stream: true,
    }),
    signal: AbortSignal.timeout(120_000), // Ollama can be slow on first inference
  });

  if (!res.ok) {
    const body = await res.text();
    throw Object.assign(
      new Error(`Ollama returned HTTP ${res.status}: ${body.slice(0, 200)}`),
      { statusCode: res.status }
    );
  }
  return res;
}

// ─── Cloud provider streaming call ───────────────────────────────────────────
async function callCloudProvider(
  cfg: ProviderConfig,
  messages: AIMessage[],
  maxTokens: number,
  temperature: number,
  requestId: string
): Promise<FetchResponse> {
  const apiKey = cfg.getApiKey()!;
  const model = nextModel(cfg);
  const estimatedTokens = Math.ceil(
    messages.reduce((s, m) => s + m.content.length, 0) / 4 + maxTokens
  );

  console.log(
    `[ai-router][${requestId}] trying provider="${cfg.name}" model="${model}" estimatedTokens≈${estimatedTokens}`
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  let res: FetchResponse;
  try {
    res = await fetch(cfg.baseUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: true,
        frequency_penalty: 0.55,
        presence_penalty: 0.35,
      }),
    });
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      console.warn(`[ai-router][${requestId}] provider="${cfg.name}" TIMEOUT`);
      blockProvider(cfg.name, 30_000, "request timeout");
      throw Object.assign(new Error("AI request timed out"), { statusCode: 504 });
    }
    blockProvider(cfg.name, 10_000, `network error: ${err.message}`);
    throw err;
  }
  clearTimeout(timeout);

  if (res.ok) {
    console.log(`[ai-router][${requestId}] provider="${cfg.name}" OK (${res.status})`);
    recordUsage(cfg.name, estimatedTokens);
    return res;
  }

  // Handle errors
  const errText = await res.text();
  let errJson: any = {};
  try { errJson = JSON.parse(errText); } catch {}
  const errMsg = errJson?.error?.message ?? errText.slice(0, 300);

  console.warn(
    `[ai-router][${requestId}] provider="${cfg.name}" HTTP ${res.status} — ${errMsg.slice(0, 200)}`
  );

  if (res.status === 429) {
    // Rate limited — mark the whole provider's window as exhausted
    const state = getState(cfg.name);
    state.requests = cfg.maxRequests;
    console.warn(`[ai-router] provider="${cfg.name}" rate-limited — switching to next provider`);
  } else if (res.status === 401) {
    blockProvider(cfg.name, 60 * 60 * 1000, "invalid API key");
  } else if (res.status >= 500) {
    blockProvider(cfg.name, 30_000, `server error ${res.status}`);
  }

  throw Object.assign(new Error(`Provider ${cfg.name} failed: ${errMsg.slice(0, 150)}`), {
    statusCode: res.status,
  });
}

// ─── Provider status for logging/debugging ───────────────────────────────────
export function getProviderStatus(): Record<string, { available: boolean; requests: number; tokens: number }> {
  const out: Record<string, any> = {};
  for (const cfg of PROVIDERS) {
    const state = getState(cfg.name);
    resetIfExpired(cfg, state);
    out[cfg.name] = {
      available: isAvailable(cfg),
      requests: state.requests,
      tokens: state.tokens,
      maxRequests: cfg.maxRequests,
      maxTokens: cfg.maxTokens,
    };
  }
  out.ollama = { available: ollamaReady && ollamaModelReady, model: OLLAMA_MODEL };
  return out;
}

// ─── Main router — PUBLIC API ─────────────────────────────────────────────────
/**
 * Resolves an AI streaming response, trying each provider in fallback order:
 *   Groq → Cerebras → Mistral → Ollama
 *
 * Returns a `fetch` Response whose body is an OpenAI-compatible SSE stream.
 * Never surfaces a rate-limit error to the caller — always falls back.
 *
 * @throws only if ALL providers fail (including Ollama).
 */
export async function resolveAIStream(
  messages: AIMessage[],
  maxTokens: number,
  temperature: number,
  requestId: string
): Promise<FetchResponse> {
  // ── Try cloud providers in priority order ────────────────────────────────
  for (const cfg of PROVIDERS) {
    if (!isAvailable(cfg)) {
      const state = getState(cfg.name);
      const reason = !cfg.getApiKey()
        ? "no API key"
        : state.requests >= cfg.maxRequests
        ? `request limit hit (${state.requests}/${cfg.maxRequests})`
        : cfg.maxTokens && state.tokens >= cfg.maxTokens
        ? `token limit hit (${state.tokens}/${cfg.maxTokens})`
        : "blocked";
      console.log(`[ai-router][${requestId}] skipping provider="${cfg.name}" — ${reason}`);
      continue;
    }

    try {
      return await callCloudProvider(cfg, messages, maxTokens, temperature, requestId);
    } catch (err: any) {
      console.warn(
        `[ai-router][${requestId}] provider="${cfg.name}" failed — ${err.message} — trying next`
      );
      // Continue to next provider
    }
  }

  // ── All cloud providers exhausted — fall back to local Ollama ────────────
  console.log(`[ai-router][${requestId}] all cloud providers exhausted — using Ollama offline fallback`);
  try {
    return await callOllama(messages, maxTokens, requestId);
  } catch (ollamaErr: any) {
    console.error(`[ai-router][${requestId}] Ollama fallback also failed: ${ollamaErr.message}`);
  }

  // ── Absolute last resort — throw with a user-friendly message ────────────
  throw Object.assign(
    new Error("The AI is temporarily busy. Please try again in a moment."),
    { statusCode: 503, debugInfo: "all providers exhausted" }
  );
}
