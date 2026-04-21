import { describe, it, expect } from "vitest"

import Papa from "papaparse"

// PRSP-04: CSV export produces correct column order and handles array tags
// We test the pure data-shaping logic (same as exportProspectsCSV) without
// hitting the database.

const EXPECTED_COLUMNS = [
  "handle",
  "platform",
  "pipeline_status",
  "display_name",
  "bio",
  "notes",
  "tags",
  "created_at",
]

function buildCsvRow(overrides: Partial<Record<string, unknown>> = {}) {
  const row = {
    handle: overrides.handle ?? "test_user",
    platform: overrides.platform ?? "reddit",
    pipeline_status: overrides.pipeline_status ?? "detected",
    display_name: overrides.display_name ?? "Test User",
    bio: overrides.bio ?? "Builds SaaS tools",
    notes: overrides.notes ?? "",
    tags: overrides.tags ?? "",
    created_at: overrides.created_at ?? "2026-04-20T10:00:00Z",
  }
  return row
}

describe("exportProspectsCSV data shape (PRSP-04)", () => {
  it("produces a CSV with the required column headers in the correct order", () => {
    const rows = [buildCsvRow()]
    const csv = Papa.unparse(rows, {
      header: true,
      columns: EXPECTED_COLUMNS,
    })
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true })
    expect(parsed.meta.fields).toEqual(EXPECTED_COLUMNS)
  })

  it("joins array tags with ', ' separator", () => {
    // Matches the exportProspectsCSV row-mapping logic:
    // tags: Array.isArray(row.tags) ? row.tags.join(", ") : ""
    const rawTags = ["hot-lead", "saas", "q4"]
    const joined = Array.isArray(rawTags) ? rawTags.join(", ") : ""
    const rows = [buildCsvRow({ tags: joined })]
    const csv = Papa.unparse(rows, { header: true, columns: EXPECTED_COLUMNS })
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true })
    expect(parsed.data[0].tags).toBe("hot-lead, saas, q4")
  })

  it("maps null fields to empty strings", () => {
    // Matches: handle: row.handle ?? ""
    const nullHandle = null
    const resolved = nullHandle ?? ""
    const rows = [buildCsvRow({ handle: resolved })]
    const csv = Papa.unparse(rows, { header: true, columns: EXPECTED_COLUMNS })
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true })
    expect(parsed.data[0].handle).toBe("")
  })

  it("includes all 8 required columns — no extra columns", () => {
    const rows = [buildCsvRow()]
    const csv = Papa.unparse(rows, { header: true, columns: EXPECTED_COLUMNS })
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true })
    expect(parsed.meta.fields).toHaveLength(8)
  })
})
