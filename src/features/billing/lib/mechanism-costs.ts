import { createClient } from "@/lib/supabase/server"

export interface MechanismCost {
  mechanism_id: string
  unit_cost: number
  mechanism_kind: "signal" | "outbound"
  premium: boolean
  requires_gologin: boolean
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
