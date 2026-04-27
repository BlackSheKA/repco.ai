import {
  ACCOUNT_COSTS,
  INCLUDED_ACCOUNTS,
  type AccountPlatform,
} from "./types"
import { getMechanismCost } from "./mechanism-costs"

export type CadenceBucket =
  | "15min"
  | "30min"
  | "1h"
  | "2h"
  | "4h"
  | "6h"
  | "24h"

export const SCANS_PER_DAY: Record<CadenceBucket, number> = {
  "15min": 96,
  "30min": 48,
  "1h": 24,
  "2h": 12,
  "4h": 6,
  "6h": 4,
  "24h": 1,
}

/**
 * Map a Postgres interval (string form) to one of the 7 supported cadence buckets.
 * Returns null for unrecognized intervals (treated as 0 contribution).
 * Accepts both Postgres canonical output ("00:15:00", "06:00:00", "1 day") and
 * friendly literals ("15 minutes", "6 hours", "24 hours").
 */
export function intervalToCadenceBucket(
  pgInterval: string,
): CadenceBucket | null {
  const v = pgInterval.trim().toLowerCase()
  if (v === "00:15:00") return "15min"
  if (v === "00:30:00") return "30min"
  if (v === "01:00:00") return "1h"
  if (v === "02:00:00") return "2h"
  if (v === "04:00:00") return "4h"
  if (v === "06:00:00") return "6h"
  if (v === "24:00:00" || v === "1 day" || v === "1 days") return "24h"
  if (v === "15 minutes" || v === "15 min") return "15min"
  if (v === "30 minutes" || v === "30 min") return "30min"
  if (v === "1 hour") return "1h"
  if (v === "2 hours") return "2h"
  if (v === "4 hours") return "4h"
  if (v === "6 hours") return "6h"
  if (v === "24 hours") return "24h"
  return null
}

export interface MonitoringSignalInput {
  mechanism_id: string
  frequency: string
  active: boolean
}

export interface AccountInput {
  platform: string
  active: boolean
}

/**
 * Sum the daily credit burn for all active monitoring signals.
 *
 * Per-row formula: unit_cost × scans_per_day(frequency)
 * Special case: E1 (signal stacking) adds 5 cr/day FLAT once per user, regardless
 * of cadence or how many E1 rows are active.
 *
 * Unknown mechanism_id or unknown cadence bucket contribute 0 (fail-safe).
 */
export async function calculateMonitoringBurn(
  signals: MonitoringSignalInput[],
): Promise<number> {
  let total = 0
  let e1Counted = false

  for (const signal of signals) {
    if (!signal.active) continue

    if (signal.mechanism_id === "E1") {
      if (!e1Counted) {
        total += 5
        e1Counted = true
      }
      continue
    }

    const cost = await getMechanismCost(signal.mechanism_id)
    if (!cost) continue
    if (cost.mechanism_kind !== "signal") continue

    const bucket = intervalToCadenceBucket(signal.frequency)
    if (!bucket) continue

    total += cost.unit_cost * SCANS_PER_DAY[bucket]
  }

  return total
}

/**
 * Sum the daily credit burn for active social accounts beyond the
 * INCLUDED_ACCOUNTS free tier. Counting is by total active accounts
 * (across platforms); extra accounts are billed at each account's
 * platform-specific rate, in insertion order.
 */
export function calculateAccountBurn(accounts: AccountInput[]): number {
  const active = accounts.filter((a) => a.active)
  if (active.length <= INCLUDED_ACCOUNTS) return 0

  const extras = active.slice(INCLUDED_ACCOUNTS)
  let total = 0
  for (const account of extras) {
    const cost = ACCOUNT_COSTS[account.platform as AccountPlatform]
    if (typeof cost === "number") {
      total += cost
    }
  }
  return total
}

/**
 * Total daily credit burn: monitoring signals + extra accounts.
 */
export async function calculateDailyBurn(
  signals: MonitoringSignalInput[],
  accounts: AccountInput[],
): Promise<number> {
  const m = await calculateMonitoringBurn(signals)
  const a = calculateAccountBurn(accounts)
  return m + a
}
