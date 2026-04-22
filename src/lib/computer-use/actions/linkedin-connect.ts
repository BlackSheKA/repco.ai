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
1. Find and click the Connect button. LinkedIn places it in one of two spots:
   (a) Directly in the profile header (usually for 2nd-degree connections).
   (b) Inside the "More" dropdown (common for 3rd-degree and out-of-network).
   Procedure:
   - If you clearly see a "Connect" button in the profile header, click it.
   - Otherwise click the "More" button (or "More actions") in the header. A
     dropdown will appear. Click "Connect" inside that dropdown.
   - If you see a "Pending" button in the header, the invitation was already
     sent - stop and report "already_connected".
   - ONLY report "already_connected" for a Message button if you ALSO see a
     clear "1st" degree badge next to the profile name. Message alone (e.g.
     next to Follow/More on a 2nd/3rd degree profile) does NOT mean
     connected - it just means LinkedIn is offering InMail. In that case
     open the More dropdown and click Connect there.
   - If, after opening More, you cannot find a Connect option at all, stop
     and report "no_connect_available".

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
