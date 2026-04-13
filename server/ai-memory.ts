/**
 * AI Memory Layer — ArtixPOS
 *
 * Inspired by SimpleMem's "semantic lossless compression" approach.
 * Every conversation is compressed into atomic bullet facts and stored
 * per tenant. Survives chat deletion. Improves the AI over time
 * without growing the system prompt linearly.
 *
 * Flow:
 *   Session ends → extractAndStore() → atomic facts saved to DB
 *   Session starts → getRelevantMemories() → top facts injected into prompt
 *   Periodically → consolidate() → merge duplicates, decay stale facts
 */

import { db } from "./db";
import { aiMemories } from "@shared/schema";
import { eq, and, desc, sql, lt, lte } from "drizzle-orm";

const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";
const EXTRACTION_MODEL = "llama-3.1-8b-instant";
const MAX_MEMORIES_PER_TENANT = 120;
const DECAY_DAYS = 45;
const TOKEN_BUDGET = 280;
const WORDS_PER_MEMORY_EST = 10;
const MAX_MEMORIES_INJECTED = Math.floor(TOKEN_BUDGET / WORDS_PER_MEMORY_EST);

type ChatMessage = { role: "user" | "assistant"; content: string };

// ─── Extraction ────────────────────────────────────────────────────────────────
// Calls Groq with the SimpleMem-style prompt to extract atomic facts.
// Returns null on any failure — memory is always best-effort.
async function callGroqForExtraction(
  conversation: ChatMessage[],
  businessType: string | null,
): Promise<Array<{ content: string; category: string; importance: number }> | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const convoText = conversation
    .map((m) => `${m.role === "user" ? "Owner" : "AI"}: ${m.content}`)
    .join("\n");

  const systemPrompt = `You are a memory extractor for a POS business assistant${businessType ? ` used by a ${businessType} business` : ""}.

Extract 2-5 atomic business facts from this conversation worth remembering for future sessions.

RULES:
- Each fact = ONE compact sentence, max 12 words
- Only extract facts revealed by the OWNER (corrections, preferences, habits, confirmations)
- Skip: generic AI advice, questions the owner asked, zero-data sessions, greetings
- Score importance 1-10 (10 = strong owner preference/correction, 5 = useful pattern, 1 = trivial)
- Categories: preference | operational | product | customer | financial

If nothing worth remembering exists, return: {"memories":[]}

Output ONLY valid JSON, no markdown fences:
{"memories":[{"content":"...","category":"preference","importance":8}]}`;

  try {
    const res = await fetch(GROQ_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EXTRACTION_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `CONVERSATION:\n${convoText.slice(0, 6000)}` },
        ],
        temperature: 0.1,
        max_tokens: 512,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.memories)) return null;
    return parsed.memories.filter(
      (m: any) =>
        typeof m.content === "string" &&
        m.content.trim().length > 5 &&
        typeof m.importance === "number",
    );
  } catch {
    return null;
  }
}

// ─── Extract and store memories after a session ────────────────────────────────
export async function extractAndStore(opts: {
  tenantId: string;
  businessType: string | null;
  conversation: ChatMessage[];
}): Promise<void> {
  const { tenantId, businessType, conversation } = opts;
  if (conversation.length < 2) return;

  const facts = await callGroqForExtraction(conversation, businessType);
  if (!facts || facts.length === 0) return;

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + DECAY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  for (const f of facts) {
    const content = f.content.trim();
    const importance = Math.min(10, Math.max(1, Math.round(f.importance)));
    const category = f.category || "general";

    // Deduplicate: skip if very similar fact already exists (simple word-overlap check)
    const existing = await db
      .select({ id: aiMemories.id, content: aiMemories.content })
      .from(aiMemories)
      .where(eq(aiMemories.tenantId, tenantId))
      .limit(MAX_MEMORIES_PER_TENANT);

    const isDuplicate = existing.some((e) => {
      const wordsA = new Set(e.content.toLowerCase().split(/\s+/));
      const wordsB = content.toLowerCase().split(/\s+/);
      const overlap = wordsB.filter((w) => wordsA.has(w)).length;
      return overlap / Math.max(wordsB.length, 1) > 0.7;
    });
    if (isDuplicate) continue;

    // Enforce per-tenant cap: delete lowest-importance + oldest if at limit
    if (existing.length >= MAX_MEMORIES_PER_TENANT) {
      await db.execute(
        sql`DELETE FROM ai_memories WHERE tenant_id = ${tenantId}
            AND id = (
              SELECT id FROM ai_memories WHERE tenant_id = ${tenantId}
              ORDER BY importance_score ASC, created_at ASC LIMIT 1
            )`,
      );
    }

    const memory = {
      tenantId,
      businessType: businessType ?? null,
      content,
      category,
      importanceScore: importance,
      accessCount: 0,
      lastAccessedAt: null,
      createdAt: now,
      expiresAt,
    } as any;

    await db.insert(aiMemories).values(memory);
  }

  console.log(`[ai-memory] stored ${facts.length} facts for tenant=${tenantId}`);
}

// ─── Retrieve relevant memories for injection ──────────────────────────────────
// Returns a compact string block ready to prepend to the system prompt.
// Token-budgeted: max ~280 tokens of memory context.
export async function getRelevantMemories(opts: {
  tenantId: string;
  businessType: string | null;
  queryHint?: string;
}): Promise<string> {
  const { tenantId, businessType, queryHint } = opts;

  try {
    // Fetch top memories for this tenant sorted by importance + recency
    const memories = await db
      .select()
      .from(aiMemories)
      .where(
        and(
          eq(aiMemories.tenantId, tenantId),
          // Exclude expired memories
          sql`(expires_at IS NULL OR expires_at > ${new Date().toISOString()})`,
        ),
      )
      .orderBy(desc(aiMemories.importanceScore), desc(aiMemories.createdAt))
      .limit(MAX_MEMORIES_INJECTED * 2);

    if (memories.length === 0) return "";

    // Score for relevance when we have a query hint
    const hints = queryHint
      ? queryHint.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
      : [];

    const scored = memories.map((m) => {
      let score = m.importanceScore;
      if (hints.length > 0) {
        const lower = m.content.toLowerCase();
        const matchCount = hints.filter((h) => lower.includes(h)).length;
        score += matchCount * 2;
      }
      return { ...m, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, MAX_MEMORIES_INJECTED);

    // Update access stats async (fire-and-forget)
    const ids = top.map((m) => m.id);
    const now = new Date().toISOString();
    db.execute(
      sql`UPDATE ai_memories SET access_count = access_count + 1, last_accessed_at = ${now}
          WHERE id = ANY(${ids})`,
    ).catch(() => {});

    // Format as a compact block (SimpleMem-style — bullets, no padding)
    const lines = top.map((m) => `• [${m.category}] ${m.content}`);
    return `[BUSINESS MEMORY — ${lines.length} learned facts]\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

// ─── Consolidation — merge duplicates, decay stale memories ───────────────────
// Call this occasionally (triggered when a tenant hits 60+ memories).
export async function consolidateIfNeeded(tenantId: string): Promise<void> {
  try {
    const count = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(aiMemories)
      .where(eq(aiMemories.tenantId, tenantId));

    const total = Number(count[0]?.n ?? 0);
    if (total < 60) return;

    // 1. Hard-delete expired memories
    await db
      .delete(aiMemories)
      .where(
        and(
          eq(aiMemories.tenantId, tenantId),
          lt(aiMemories.expiresAt, new Date().toISOString()),
        ),
      );

    // 2. Decay: lower importance of memories never accessed and older than 20 days
    const cutoff = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    await db.execute(
      sql`UPDATE ai_memories
          SET importance_score = GREATEST(1, importance_score - 1),
              expires_at = CASE
                WHEN importance_score <= 2
                THEN ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()}
                ELSE expires_at
              END
          WHERE tenant_id = ${tenantId}
            AND (last_accessed_at IS NULL OR last_accessed_at < ${cutoff})
            AND access_count = 0`,
    );

    console.log(`[ai-memory] consolidation done for tenant=${tenantId} (had ${total} memories)`);
  } catch (err) {
    console.error("[ai-memory] consolidation error:", err);
  }
}
