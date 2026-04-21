/**
 * LinkedIn Connect prompt generator for Haiku CU.
 *
 * Produces a step-by-step prompt that guides CU to send a LinkedIn
 * connection request with a personalised note.
 *
 * Decision (10-CONTEXT.md):
 * - Always use "Add a note" path — "Send without note" has worse acceptance rates.
 * - Two-step Connect discovery: header button OR More dropdown (LinkedIn A/B test
 *   has been running 18+ months; both placements must be handled).
 * - already_connected detection: if Message button visible where Connect would be,
 *   report "already_connected" and stop.
 * - Success verification: wait for "Pending" button state or "Invitation sent" toast.
 */

export function getLinkedInConnectPrompt(
  profileSlug: string,
  note: string,
  displayName?: string,
): string {
  const nameContext = displayName ? ` (${displayName})` : ""
  return `You are on a LinkedIn profile page for ${profileSlug}${nameContext}.
Send a connection request with a personalized note.

Steps:
1. Look at the profile header area (below the cover photo).
   - If you see a "Connect" button directly in the header, click it.
   - If you do NOT see a "Connect" button, click the "More" button (or "More options")
     in the header and select "Connect" from the dropdown menu.
   - If you see a "Message" button where "Connect" would normally appear, this person
     is already a 1st-degree connection. Stop immediately and report "already_connected".
   - If you see a "Pending" button, the invitation was already sent. Stop and report
     "already_connected".

2. After clicking Connect, a dialog will appear asking how you know this person.
   - If asked to select a relationship, choose "Other" or skip if possible.
   - Click "Add a note" (do NOT click "Send without note").

3. In the note text area, paste this exact text (do not modify it):

${note}

4. Click the "Send" button (or "Send invitation") to submit the request.

5. After sending, verify the request was sent by looking for ONE of:
   - The "Connect" button changed to a "Pending" button on the profile.
   - A confirmation toast or banner appeared saying "Invitation sent".
   Take a screenshot of this confirmation state as proof.

Important:
- Do not add any extra text to the note.
- Do not navigate away before confirming success.
- If at any step you see a security check, CAPTCHA, or checkpoint page at
  linkedin.com/checkpoint/, stop and report "security_checkpoint".
- If at any step you are redirected to the LinkedIn login page, stop and
  report "session_expired".
- If you see a banner saying "You've reached the weekly invitation limit" or
  similar, stop and report "weekly_limit_reached".
- If the profile page shows "This LinkedIn member is no longer available"
  or returns a 404 error, stop and report "profile_unreachable".`
}
