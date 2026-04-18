/**
 * Reddit engagement prompt generators for Haiku CU.
 *
 * Produces step-by-step prompts for like (upvote) and follow actions.
 * These are auto-executed without approval.
 */

export function getRedditLikePrompt(postUrl: string): string {
  return `You are on Reddit viewing: ${postUrl}
Click the upvote button on this post. The upvote arrow should turn orange/red after clicking.`
}

export function getRedditFollowPrompt(userHandle: string): string {
  return `You are on Reddit. Follow user "${userHandle}".
1. Navigate to https://www.reddit.com/user/${userHandle}/
2. Click the "Follow" button on their profile
3. Verify the button changes to "Following"`
}
