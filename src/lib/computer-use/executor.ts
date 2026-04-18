/**
 * Haiku CU (Computer Use) agent loop executor.
 *
 * Drives a Playwright page via Claude Haiku vision + computer_use tool.
 * Capped at 15 steps with stuck detection (3 identical screenshots = abort).
 */

import Anthropic from "@anthropic-ai/sdk"
import type { Page } from "playwright-core"
import { captureScreenshot, isStuck } from "./screenshot"
import type { CUResult } from "@/features/actions/lib/types"

const MAX_STEPS = 15
const BETA_HEADER = "computer-use-2025-01-24"

export async function executeCUAction(
  page: Page,
  prompt: string,
): Promise<CUResult> {
  const client = new Anthropic()
  const screenshots: string[] = []
  let steps = 0
  let stuck = false

  // Capture initial screenshot
  const initialScreenshot = await captureScreenshot(page)
  screenshots.push(initialScreenshot)

  // Build initial messages
  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: initialScreenshot,
          },
        },
        { type: "text", text: prompt },
      ],
    },
  ]

  // Agent loop
  while (steps < MAX_STEPS) {
    steps++

    const response = await client.beta.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      tools: [
        {
          type: "computer_20250124",
          name: "computer",
          display_width_px: 1024,
          display_height_px: 768,
          display_number: 1,
        },
      ],
      messages,
      betas: [BETA_HEADER],
    })

    // Check for tool_use blocks
    const toolBlocks = response.content.filter(
      (block) => block.type === "tool_use",
    )

    if (toolBlocks.length === 0) {
      // No tool use = task complete
      break
    }

    // Process each tool use
    for (const block of toolBlocks) {
      if (block.type === "tool_use") {
        const input = block.input as Record<string, unknown>
        await executeComputerAction(page, input)

        // Take screenshot after action
        const screenshot = await captureScreenshot(page)
        screenshots.push(screenshot)

        // Check if stuck
        if (isStuck(screenshots)) {
          stuck = true
          break
        }

        // Add assistant response + tool result to messages
        messages.push({
          role: "assistant",
          content: response.content as unknown as Anthropic.Messages.ContentBlockParam[],
        })
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: block.id,
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/png",
                    data: screenshot,
                  },
                },
              ],
            },
          ],
        })
      }
    }

    if (stuck) break
  }

  return {
    success: steps < MAX_STEPS && !stuck,
    steps,
    screenshots,
    error: stuck
      ? "Stuck detected: 3 identical screenshots"
      : steps >= MAX_STEPS
        ? "Max steps reached"
        : undefined,
  }
}

async function executeComputerAction(
  page: Page,
  input: Record<string, unknown>,
): Promise<void> {
  const action = input.action as string

  switch (action) {
    case "click":
      await page.mouse.click(
        input.coordinate
          ? (input.coordinate as number[])[0]
          : (input.x as number),
        input.coordinate
          ? (input.coordinate as number[])[1]
          : (input.y as number),
      )
      break
    case "type":
      await page.keyboard.type(input.text as string)
      break
    case "key":
      await page.keyboard.press(input.key as string)
      break
    case "scroll":
      await page.mouse.wheel(
        0,
        (input.delta_y as number | undefined) ??
          (input.coordinate ? 300 : 300),
      )
      break
    case "screenshot":
      // No-op -- handled by the agent loop
      break
    case "move":
      await page.mouse.move(
        input.coordinate
          ? (input.coordinate as number[])[0]
          : (input.x as number),
        input.coordinate
          ? (input.coordinate as number[])[1]
          : (input.y as number),
      )
      break
    case "wait":
      await new Promise((resolve) =>
        setTimeout(resolve, ((input.duration as number) ?? 1) * 1000),
      )
      break
    default:
      // Unknown action -- skip
      break
  }

  // Small random delay after each action for natural behavior
  const delay = 100 + Math.random() * 400
  await new Promise((resolve) => setTimeout(resolve, delay))
}
