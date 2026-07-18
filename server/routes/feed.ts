  /**
 * GET /api/feed — cursor-paginated sales feed
 *
 * Cursor strategy: composite (created_at, id)
 *   • created_at is an ISO-8601 text string in this schema, so it sorts
 *     lexicographically, which matches chronological order exactly.
 *   • id (serial integer) breaks ties when two rows share the same timestamp.
 *   • Together they form a globally unique position in the result set.
 *
 * Cursor encoding: base64url(JSON({ t: created_at, i: id }))
 *   • Opaque to callers — they just echo it back via ?cursor=
 *   • JSON makes it easy to add fields later without breaking existing clients
 */

import type { Express } from "express";
import { z } from "zod";
import { db } from "../db";
import { sql, and, eq, desc } from "drizzle-orm";
import { sales } from "@shared/schema";
import { requireAuth } from "../middleware";
import { getUserId, getActiveBranchId, sanitizeUserError } from "../lib/route-utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum rows per page. Callers may request fewer via ?limit= */
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Cursor helpers
// ---------------------------------------------------------------------------

interface CursorPayload {
  /** ISO-8601 created_at of the last row on the previous page */
  t: string;
  /** id of the last row on the previous page */
  i: number;
}

/**
 * Encode a cursor payload to an opaque base64url string.
 * base64url avoids the `+`, `/`, `=` characters that need URI-encoding.
 */
function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

/**
 * Decode and validate a cursor string received from the client.
 * Returns null if the cursor is missing, malformed, or tampered with —
 * the caller then treats it as a first-page request rather than an error,
 * which is the safest UX for cursor corruption.
 */
function decodeCursor(raw: string | undefined): CursorPayload | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    // Validate shape so a garbled cursor can't inject arbitrary query values
    if (typeof parsed.t !== "string" || typeof parsed.i !== "number") return null;
    return parsed as CursorPayload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Query schema
// ---------------------------------------------------------------------------

const feedQuerySchema = z.object({
  /** Opaque cursor returned by the previous page. Omit for the first page. */
  cursor: z.string().optional(),
  /** Rows per page (1–100). Defaults to 20. */
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerFeedRoutes(app: Express): void {
  /**
   * GET /api/feed
   *
   * Query params:
   *   cursor  – opaque string from a previous next_cursor response (omit for page 1)
   *   limit   – page size, 1–100 (default 20)
   *
   * Response:
   *   { data: Sale[], next_cursor: string | null }
   *
   *   next_cursor is null when there are no more pages.
   */
  app.get("/api/feed", requireAuth, async (req, res) => {
    // --- 1. Parse and validate query parameters ---
    const parseResult = feedQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({
        message: parseResult.error.issues[0]?.message ?? "Invalid query parameters",
      });
    }
    const { cursor: rawCursor, limit } = parseResult.data;

    // --- 2. Resolve caller identity (set by requireAuth middleware) ---
    const userId = getUserId(req);
    const branchId = getActiveBranchId(req); // null when the user has no active branch

    // --- 3. Decode the cursor ---
    //
    // null means "start from the beginning" (first page).
    // An invalid cursor is treated the same as no cursor: the client gets the
    // first page rather than a 400, which is more resilient to stale links.
    const cursor = decodeCursor(rawCursor);

    try {
      // --- 4. Build cursor predicate ---
      //
      // We paginate newest-first (ORDER BY created_at DESC, id DESC).
      //
      // For the composite seek we need rows that come *after* the cursor position
      // in that descending order, i.e. rows that are strictly older or, when the
      // timestamp ties, have a strictly smaller id:
      //
      //   (created_at < cursor.t) OR (created_at = cursor.t AND id < cursor.i)
      //
      // This avoids OFFSET drift: even if new rows are inserted at the top of
      // the feed, older pages remain stable.
      const cursorCondition = cursor
        ? sql`(
            ${sales.createdAt} < ${cursor.t}
            OR (${sales.createdAt} = ${cursor.t} AND ${sales.id} < ${cursor.i})
          )`
        : undefined; // first page — no cursor predicate needed

      // --- 5. Base user/branch filter ---
      //
      // Only return rows owned by the authenticated user. branchId is an
      // optional additional constraint when the user has switched to a branch.
      const baseConditions = [
        eq(sales.userId, userId),
        ...(branchId != null ? [eq(sales.branchId, branchId)] : []),
      ];

      // --- 6. Execute query — fetch limit + 1 to detect next page ---
      //
      // Requesting one extra row is the standard cursor-pagination trick:
      //   • If we get limit+1 rows back, a next page exists.
      //   • We drop the extra row from the response and encode its position
      //     as next_cursor.
      //   • If we get ≤ limit rows, this is the last page → next_cursor = null.
      const rows = await db
        .select()
        .from(sales)
        .where(
          cursorCondition
            ? // Combine base filters with cursor predicate using AND
              and(...baseConditions, cursorCondition)
            : and(...baseConditions),
        )
        .orderBy(
          // Descending on both columns so newest sales appear first and the
          // composite seek predicate above remains correct.
          desc(sales.createdAt),
          desc(sales.id),
        )
        .limit(limit + 1); // one extra to peek at whether a next page exists

      // --- 7. Determine whether a next page exists ---
      const hasMore = rows.length > limit;

      // The page the caller actually receives (without the sentinel row)
      const page = hasMore ? rows.slice(0, limit) : rows;

      // --- 8. Build next_cursor ---
      //
      // We encode the last row of the returned page (not the sentinel row).
      // On the next call the client passes this back and the seek predicate
      // in step 4 positions the window immediately after that row.
      let nextCursor: string | null = null;
      if (hasMore) {
        const last = page[page.length - 1];
        // Both fields are guaranteed non-null: id is a serial PK, createdAt
        // has a $defaultFn in the schema. Guard defensively just in case.
        if (last.createdAt != null && last.id != null) {
          nextCursor = encodeCursor({ t: last.createdAt, i: last.id });
        }
      }

      // --- 9. Send response ---
      return res.json({
        data: page,
        next_cursor: nextCursor,
      });
    } catch (err) {
      // Sanitize DB/infrastructure error messages before they reach the client
      return res.status(500).json({ message: sanitizeUserError(err) });
    }
  });
}
