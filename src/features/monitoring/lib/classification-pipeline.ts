import type { SupabaseClient } from "@supabase/supabase-js"
import { matchPost } from "./structural-matcher"
import { classifySignals } from "./sonnet-classifier"

const BATCH_SIZE = 15
const QUERY_LIMIT = 100

interface ClassificationStats {
  classified: number
  errors: number
}

export async function classifyPendingSignals(
  supabaseAdmin: SupabaseClient,
): Promise<ClassificationStats> {
  // Fetch pending signals
  const { data: pendingSignals, error: fetchError } = await supabaseAdmin
    .from("intent_signals")
    .select(
      "id, post_url, post_content, subreddit, user_id, author_handle",
    )
    .eq("classification_status", "pending")
    .limit(QUERY_LIMIT)

  if (fetchError) {
    console.error(
      "[classification-pipeline] Failed to fetch pending signals:",
      fetchError.message,
    )
    return { classified: 0, errors: 0 }
  }

  if (!pendingSignals || pendingSignals.length === 0) {
    return { classified: 0, errors: 0 }
  }

  let structuralMatches = 0
  let sonnetClassified = 0
  let errors = 0

  // Collect ambiguous signals for batch Sonnet classification
  const ambiguousBatch: Array<{
    id: string
    url: string
    title: string
    body: string
    userId: string
  }> = []

  // Process each signal with structural matcher
  for (const signal of pendingSignals) {
    try {
      // Fetch user's keywords and competitors
      const { keywords, competitors, productName, productDescription } =
        await getUserConfig(supabaseAdmin, signal.user_id)

      // Split post_content back into title and body (stored as "title\n\nbody")
      const content = signal.post_content ?? ""
      const splitIdx = content.indexOf("\n\n")
      const title = splitIdx >= 0 ? content.slice(0, splitIdx) : content
      const body = splitIdx >= 0 ? content.slice(splitIdx + 2) : ""

      const result = matchPost(title, body, keywords, competitors)

      if (result.matched && !result.ambiguous) {
        // Structural match -- update directly
        const { error: updateError } = await supabaseAdmin
          .from("intent_signals")
          .update({
            intent_type: result.intent_type,
            intent_strength: result.intent_strength,
            classification_status: "completed",
          })
          .eq("id", signal.id)

        if (updateError) {
          console.error(
            `[classification-pipeline] Failed to update signal ${signal.id}:`,
            updateError.message,
          )
          errors++
        } else {
          structuralMatches++
        }
      } else {
        // Ambiguous -- collect for Sonnet batch
        ambiguousBatch.push({
          id: signal.id,
          url: signal.post_url,
          title,
          body,
          userId: signal.user_id,
        })
      }
    } catch (err) {
      console.error(
        `[classification-pipeline] Error processing signal ${signal.id}:`,
        err,
      )
      errors++
    }
  }

  // Batch Sonnet classification for ambiguous signals
  if (ambiguousBatch.length > 0) {
    // Get product context from the first signal's user (simplification for batch)
    const firstUserId = ambiguousBatch[0].userId
    const { productName, productDescription, keywords } =
      await getUserConfig(supabaseAdmin, firstUserId)

    // Chunk into groups of BATCH_SIZE
    for (let i = 0; i < ambiguousBatch.length; i += BATCH_SIZE) {
      const chunk = ambiguousBatch.slice(i, i + BATCH_SIZE)

      try {
        const results = await classifySignals(
          chunk.map((s) => ({
            url: s.url,
            title: s.title,
            body: s.body,
          })),
          {
            name: productName,
            description: productDescription,
            keywords,
          },
        )

        // Update each classified signal
        for (const result of results) {
          const signal = chunk.find((s) => s.url === result.post_url)
          if (!signal) continue

          const { error: updateError } = await supabaseAdmin
            .from("intent_signals")
            .update({
              intent_type: result.intent_type,
              intent_strength: result.intent_strength,
              intent_reasoning: result.reasoning,
              suggested_angle: result.suggested_angle,
              classification_status: "completed",
            })
            .eq("id", signal.id)

          if (updateError) {
            console.error(
              `[classification-pipeline] Failed to update signal ${signal.id}:`,
              updateError.message,
            )
            errors++
          } else {
            sonnetClassified++
          }
        }
      } catch (err) {
        // Mark entire chunk as failed
        console.error(
          "[classification-pipeline] Sonnet batch classification failed:",
          err,
        )
        for (const signal of chunk) {
          await supabaseAdmin
            .from("intent_signals")
            .update({ classification_status: "failed" })
            .eq("id", signal.id)
        }
        errors += chunk.length
      }
    }
  }

  const totalProcessed = structuralMatches + sonnetClassified
  console.log(
    `[classification-pipeline] Summary: totalProcessed=${totalProcessed}, structuralMatches=${structuralMatches}, sonnetClassified=${sonnetClassified}, errors=${errors}`,
  )

  return { classified: totalProcessed, errors }
}

// Cache to avoid repeated queries for the same user within a run
const configCache = new Map<
  string,
  {
    keywords: string[]
    competitors: string[]
    productName: string
    productDescription: string
  }
>()

async function getUserConfig(
  supabaseAdmin: SupabaseClient,
  userId: string,
): Promise<{
  keywords: string[]
  competitors: string[]
  productName: string
  productDescription: string
}> {
  if (configCache.has(userId)) {
    return configCache.get(userId)!
  }

  const { data: signals } = await supabaseAdmin
    .from("monitoring_signals")
    .select("signal_type, value")
    .eq("user_id", userId)
    .eq("active", true)

  const keywords = (signals ?? [])
    .filter((s) => s.signal_type === "reddit_keyword")
    .map((s) => s.value)
  const competitors = (signals ?? [])
    .filter((s) => s.signal_type === "competitor")
    .map((s) => s.value)

  const { data: profiles } = await supabaseAdmin
    .from("product_profiles")
    .select("name, description")
    .eq("user_id", userId)
    .limit(1)

  const profile = profiles?.[0]

  const config = {
    keywords,
    competitors,
    productName: profile?.name ?? "",
    productDescription: profile?.description ?? "",
  }

  configCache.set(userId, config)
  return config
}
