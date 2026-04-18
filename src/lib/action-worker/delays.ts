/**
 * Random delay generator and timezone-aware timing for anti-ban.
 *
 * Uses Box-Muller transform for Gaussian-distributed delays
 * to mimic natural human browsing patterns.
 */

// Box-Muller transform for Gaussian random delay
export function randomDelay(mean = 90, std = 60, min = 15): number {
  const u1 = Math.random()
  const u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  const delay = Math.max(min, Math.round(mean + z * std))
  return delay // seconds
}

export function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000))
}

// Check if current time is within account's active hours in their timezone
export function isWithinActiveHours(
  timezone: string,
  activeStart: number, // 0-23
  activeEnd: number, // 0-23
): boolean {
  // Use Intl.DateTimeFormat to get current hour in timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  })
  const currentHour = parseInt(formatter.format(new Date()), 10)
  // Handle wrap-around (e.g., activeStart=22, activeEnd=6)
  if (activeStart <= activeEnd) {
    return currentHour >= activeStart && currentHour < activeEnd
  }
  return currentHour >= activeStart || currentHour < activeEnd
}
