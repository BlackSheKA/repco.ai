/**
 * Screenshot capture, comparison, and Supabase Storage upload.
 *
 * Used by the CU executor to detect stuck loops and store
 * action screenshots for audit/debugging.
 */

import type { Page } from "playwright-core"
import { createClient } from "@supabase/supabase-js"

/**
 * Capture a screenshot from a Playwright page as base64 PNG.
 * Resized to 1024x768 if the viewport is larger (Anthropic CU constraint).
 */
export async function captureScreenshot(page: Page): Promise<string> {
  const screenshot = await page.screenshot({
    type: "png",
    clip: { x: 0, y: 0, width: 1024, height: 768 },
  })
  return screenshot.toString("base64")
}

/**
 * Detect if the CU agent is stuck by comparing the last 3 screenshots.
 * Returns true if all 3 are identical (base64 string comparison).
 */
export function isStuck(screenshots: string[]): boolean {
  if (screenshots.length < 3) return false
  const last3 = screenshots.slice(-3)
  return last3[0] === last3[1] && last3[1] === last3[2]
}

/**
 * Upload a screenshot to Supabase Storage (private bucket).
 * Returns a 7-day signed URL, or null on error.
 */
export async function uploadScreenshot(
  actionId: string,
  screenshotBase64: string,
  step: number,
): Promise<string | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const path = `actions/${actionId}/step-${step}.png`
  const buffer = Buffer.from(screenshotBase64, "base64")

  const { error: uploadError } = await supabase.storage
    .from("screenshots")
    .upload(path, buffer, {
      contentType: "image/png",
      upsert: true,
    })

  if (uploadError) {
    console.error("Screenshot upload failed:", uploadError.message)
    return null
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from("screenshots")
    .createSignedUrl(path, 86400 * 7)

  if (signedError || !signedData?.signedUrl) {
    console.error(
      "Signed URL creation failed:",
      signedError?.message ?? "No URL returned",
    )
    return null
  }

  return signedData.signedUrl
}
