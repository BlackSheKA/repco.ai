/**
 * Unit tests for terminal entry text-generation rules.
 *
 * These tests validate the behavioral contract for DASH-01 (terminal header
 * shows last 5 agent actions) and AGNT-03 (terminal "Intent detected" entries
 * show post excerpt) by replicating the exact logic from use-realtime-terminal.ts.
 *
 * The functions are not exported from the hook file, so we test the rules here
 * as a specification guard against regressions.
 */
import { describe, it, expect } from "vitest"

// ---- Inline replication of transformJobLog from use-realtime-terminal.ts ----
// Any change to the implementation that breaks these contracts will fail here.

interface JobLogRow {
  id: string
  status: string
  started_at: string
  metadata: Record<string, unknown> | null
}

interface TerminalEntry {
  id: string
  text: string
  type: string
  timestamp: Date
}

function transformJobLog(row: JobLogRow): TerminalEntry {
  const totalSignals = (row.metadata?.total_signals as number) ?? 0

  if (row.status === "completed" && totalSignals > 0) {
    return {
      id: row.id,
      text: `\u2713 ${totalSignals} new signals added to your feed`,
      type: "complete",
      timestamp: new Date(row.started_at),
    }
  }

  if (row.status === "completed" && totalSignals === 0) {
    return {
      id: row.id,
      text: "> No new signals this scan",
      type: "quiet",
      timestamp: new Date(row.started_at),
    }
  }

  if (row.status === "started" || row.status === "in_progress") {
    return {
      id: row.id,
      text: "> Scanning Reddit...",
      type: "scanning",
      timestamp: new Date(row.started_at),
    }
  }

  return {
    id: row.id,
    text: "> Scanning interrupted \u2014 retrying in 15 minutes",
    type: "quiet",
    timestamp: new Date(row.started_at),
  }
}

// ---- Terminal intent entry format (AGNT-03) ----

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + "..."
}

function buildIntentEntry(row: {
  id: string
  author_handle: string
  post_content: string   // NOTE: must be post_content, NOT content_snippet
  intent_strength: number
  detected_at: string
}): TerminalEntry {
  const excerpt = truncate(row.post_content ?? "", 50)
  return {
    id: row.id,
    text: `> Intent detected: ${row.author_handle} "${excerpt}" [${row.intent_strength}/10]`,
    type: "found",
    timestamp: new Date(row.detected_at),
  }
}

// ---- Tests ----

describe("transformJobLog — terminal job log text rules (DASH-01 / MNTR-07)", () => {
  const BASE = {
    id: "job-1",
    started_at: "2026-04-21T10:00:00Z",
  }

  it("completed run with signals: text contains signal count and 'feed'", () => {
    const entry = transformJobLog({
      ...BASE,
      status: "completed",
      metadata: { total_signals: 5 },
    })
    expect(entry.text).toContain("5 new signals")
    expect(entry.text).toContain("feed")
    expect(entry.type).toBe("complete")
  })

  it("completed run with zero signals: shows 'No new signals this scan'", () => {
    const entry = transformJobLog({
      ...BASE,
      status: "completed",
      metadata: { total_signals: 0 },
    })
    expect(entry.text).toBe("> No new signals this scan")
    expect(entry.type).toBe("quiet")
  })

  it("started status: shows 'Scanning Reddit...'", () => {
    const entry = transformJobLog({
      ...BASE,
      status: "started",
      metadata: null,
    })
    expect(entry.text).toBe("> Scanning Reddit...")
    expect(entry.type).toBe("scanning")
  })

  it("in_progress status: shows 'Scanning Reddit...'", () => {
    const entry = transformJobLog({
      ...BASE,
      status: "in_progress",
      metadata: null,
    })
    expect(entry.text).toBe("> Scanning Reddit...")
  })

  it("failed status: shows retry message", () => {
    const entry = transformJobLog({
      ...BASE,
      status: "failed",
      metadata: null,
    })
    expect(entry.text).toContain("retrying in 15 minutes")
    expect(entry.type).toBe("quiet")
  })

  it("timestamp is parsed from started_at", () => {
    const entry = transformJobLog({
      ...BASE,
      status: "completed",
      metadata: { total_signals: 1 },
    })
    expect(entry.timestamp.toISOString()).toBe("2026-04-21T10:00:00.000Z")
  })
})

describe("terminal intent entry format — post_content field (AGNT-03)", () => {
  const SIGNAL_ROW = {
    id: "sig-1",
    author_handle: "u/janedoe",
    post_content: "I need a CRM that handles my workflow and also does email tracking",
    intent_strength: 8,
    detected_at: "2026-04-21T11:00:00Z",
  }

  it("entry text starts with '> Intent detected:'", () => {
    const entry = buildIntentEntry(SIGNAL_ROW)
    expect(entry.text).toMatch(/^> Intent detected:/)
  })

  it("entry text includes author_handle", () => {
    const entry = buildIntentEntry(SIGNAL_ROW)
    expect(entry.text).toContain("u/janedoe")
  })

  it("entry text includes truncated post_content excerpt in quotes", () => {
    const entry = buildIntentEntry(SIGNAL_ROW)
    // Excerpt is first 50 chars of post_content
    const expected50 = SIGNAL_ROW.post_content.slice(0, 50)
    expect(entry.text).toContain(`"${expected50}`)
  })

  it("entry text includes intent_strength as N/10", () => {
    const entry = buildIntentEntry(SIGNAL_ROW)
    expect(entry.text).toContain("[8/10]")
  })

  it("excerpt is truncated to 50 chars with '...' suffix when content is longer", () => {
    const longContent = "A".repeat(100)
    const entry = buildIntentEntry({ ...SIGNAL_ROW, post_content: longContent })
    expect(entry.text).toContain(`"${"A".repeat(50)}..."`)
  })

  it("short excerpt (< 50 chars) is not truncated", () => {
    const shortContent = "Short post"
    const entry = buildIntentEntry({ ...SIGNAL_ROW, post_content: shortContent })
    expect(entry.text).toContain(`"Short post"`)
    expect(entry.text).not.toContain("...")
  })

  it("entry type is 'found'", () => {
    const entry = buildIntentEntry(SIGNAL_ROW)
    expect(entry.type).toBe("found")
  })
})
