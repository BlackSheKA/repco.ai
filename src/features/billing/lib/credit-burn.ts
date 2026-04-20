import {
  ACCOUNT_COSTS,
  INCLUDED_ACCOUNTS,
  MONITORING_COSTS,
  type AccountPlatform,
  type MonitoringSignalType,
} from "./types"

export interface MonitoringSignalInput {
  signal_type: string
  active: boolean
}

export interface AccountInput {
  platform: string
  active: boolean
}

/**
 * Sum the daily credit burn for all active monitoring signals.
 * Unknown signal types contribute 0 credits (fail-safe).
 */
export function calculateMonitoringBurn(
  signals: MonitoringSignalInput[],
): number {
  let total = 0
  for (const signal of signals) {
    if (!signal.active) continue
    const cost = MONITORING_COSTS[signal.signal_type as MonitoringSignalType]
    if (typeof cost === "number") {
      total += cost
    }
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
export function calculateDailyBurn(
  signals: MonitoringSignalInput[],
  accounts: AccountInput[],
): number {
  return calculateMonitoringBurn(signals) + calculateAccountBurn(accounts)
}
