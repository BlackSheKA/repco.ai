/**
 * Reddit DM prompt generator for Haiku CU.
 *
 * Produces a step-by-step prompt that guides CU to send
 * a direct message to a Reddit user.
 */

export function getRedditDMPrompt(
  recipientHandle: string,
  messageContent: string,
): string {
  return `You are on Reddit. Send a direct message to user "${recipientHandle}".

Steps:
1. Click the chat/message icon in the top navigation bar
2. Click "New Message" or the compose button
3. In the "To" field, type "${recipientHandle}"
4. Wait for the username suggestion to appear, then click on it
5. In the message body field, type the following message exactly:

${messageContent}

6. Click the "Send" button
7. Verify the message was sent (confirmation appears)

Do not add any extra text. Send exactly the message above.`
}
