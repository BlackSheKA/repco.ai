import { createClient } from "@/lib/supabase/server"

export interface MechanismCost {
  mechanism_id: string
  unit_cost: number
  mechanism_kind: "signal" | "outbound"
  premium: boolean
  /**
   * Phase 17.5 plan-03: TS field renamed for vendor neutrality. The underlying
   * DB column `mechanism_costs.requires_browser_vendor` rename is deferred to
   * a separate migration; nothing in burn logic reads this field today, so
   * the (still-present) DB column→TS-field name drift is benign.
   */
  requires_browser: boolean
  free_tier_allowed: boolean
  description: string | null
  created_at: string
}

let _cache: Map<string, MechanismCost> | null = null

export async function getAllMechanismCosts(): Promise<
  Map<string, MechanismCost>
> {
  if (_cache) return _cache
  const supabase = await createClient()
  const { data, error } = await supabase.from("mechanism_costs").select("*")
  if (error) {
    throw new Error(`mechanism_costs lookup failed: ${error.message}`)
  }
  _cache = new Map(
    (data ?? []).map((row) => [row.mechanism_id, row as MechanismCost]),
  )
  return _cache
}

export async function getMechanismCost(
  id: string,
): Promise<MechanismCost | null> {
  const map = await getAllMechanismCosts()
  return map.get(id) ?? null
}

export function invalidateMechanismCostCache(): void {
  _cache = null
}
