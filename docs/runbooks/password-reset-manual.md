# Manual Password Reset (No Email Provider)

Purpose: allow operators to help a user reset their password when email delivery is unavailable, without revealing account existence or touching passwords directly.

## Preconditions

- Email provider is not configured or temporarily unavailable.
- Frontend is deployed with `VITE_RESET_MODE=manual` (so the UI does not promise email delivery).
- You have production `DATABASE_URL` and shell access to run Node scripts.

## Generate a one-time reset token (operator)

1. Run the helper script from the repo root (does not require the API server to be restarted):

   ```bash
   DATABASE_URL="<prod-connection-string>" node apps/api/scripts/create-reset-token.js --handle <user-handle> --ttl-hours 1
   ```

   - Looks up the user by handle (case-insensitive). If not found, exit and respond to the requester with a generic “We’ll follow up” message to avoid enumeration.
   - Inserts a token into `auth_password_reset` with a 1-hour expiry (adjust `--ttl-hours` if needed).
   - Prints JSON containing the handle, user id, expiry, and the **reset token**.

## Deliver to the user (support)

1. Send the token out-of-band (e.g., verified support email or secure chat). Do **not** send passwords or ask the user to share one.

2. Message template:

   ```text
   We’ve generated a one-time password reset token for you.
   Token: <token>
   This expires at <timestamp>. Go to https://fantasy-oscars.onrender.com/reset/confirm and paste the token, then set a new password.
   ```

3. Remind the user not to forward the token and to complete the reset promptly.

## User completes the reset

- User visits `/reset/confirm`, pastes the token, and sets a new password. The token is consumed on success; expired or reused tokens are rejected.

## Safeguards & notes

- Operators never see or set passwords; the API hashes the new password when the user submits `/auth/reset-confirm`.
- The process preserves non-enumerating behavior: if a handle isn’t found, provide a generic response and do not hint whether the account exists.
- No direct database edits are needed; the script performs the same insert the API uses.
