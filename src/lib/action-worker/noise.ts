/**
 * Behavioral noise action generator for anti-ban.
 *
 * 60% of actions should be noise (browse, scroll, like unrelated)
 * to mimic natural human browsing behavior and avoid detection.
 */

// 60% of actions should be noise (browse, scroll, like unrelated)
export function shouldInjectNoise(): boolean {
  return Math.random() < 0.6
}

// Generate CU prompts for noise actions (unrelated browsing behavior)
export function generateNoiseActions(): string[] {
  const noisePrompts = [
    "Scroll down slowly on the current page, reading the content. Stop after scrolling about 3 times.",
    "Click on a random post on the Reddit homepage. Read it for a moment, then go back.",
    "Navigate to reddit.com/r/all and scroll through a few posts. Upvote one post that looks interesting.",
    "Navigate to reddit.com/r/popular and browse for a moment. Click on one post, read it, then go back.",
    "Scroll up and down on the current page a few times, as if reading through content.",
  ]
  // Return 1-3 random noise prompts
  const count = Math.floor(Math.random() * 3) + 1
  const shuffled = noisePrompts.sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}
