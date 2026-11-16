# Runbook: Email (Resend)

## TL;DR

- The app sends one kind of email: the password reset link a player asks for
  ([auth.md](auth.md#password-reset-by-email)). No signup or email-change
  confirmations, no marketing.
- Provider: [Resend](https://resend.com), free plan: 3,000 emails a month, 100 a day.
- The API calls Resend's HTTP API with `RESEND_API_KEY`. Without the key, development
  and tests use a logging mailer (the link goes to the API log as `mail_logged`), and
  production logs `mail_not_configured` and reports to Sentry on every attempt while
  the request route still answers normally.
- Inbound mail for the domain is forwarded by ImprovMX through the apex MX and SPF
  records. **Never change or delete those records.** Everything below adds records;
  it edits none.

Configuration (`.env` on the VPS, passed to the API by `infra/compose.prod.yml`; see
the application keys table in [vps.md](vps.md)):

| Key              | Value                                                        |
| ---------------- | ------------------------------------------------------------ |
| `RESEND_API_KEY` | Sending-only key for the domain (step 4)                     |
| `MAIL_FROM`      | Default `Fantasy Oscars <no-reply@fantasy-oscars.com>`       |
| `MAIL_REPLY_TO`  | Default `support@fantasy-oscars.com` (forwarded by ImprovMX) |
| `WEB_BASE_URL`   | Default `https://$SITE_HOST`; the origin in reset links      |

## One-time setup (owner)

### 1. Create the Resend account

Sign up at resend.com with the owner's address and turn on two-factor
authentication (Settings, Account).

### 2. Add the domain

Domains, Add domain: `fantasy-oscars.com`. Pick the region closest to the server.
Keep the default custom return path, `send`: bounces and SPF then live on
`send.fantasy-oscars.com`, so the apex SPF record (ImprovMX's) stays exactly as it is.

In the domain's settings, check that **open tracking and click tracking are off**
(the default). The app's emails must not carry tracking pixels or rewritten links,
and the API request does not switch them off per message.

### 3. Add the DNS records at GoDaddy

Resend lists the records to add on the domain page. Typically:

| Type | Name (as typed at GoDaddy) | Value                                      |
| ---- | -------------------------- | ------------------------------------------ |
| TXT  | `resend._domainkey`        | the DKIM key Resend shows (`p=MIGf...`)    |
| MX   | `send`                     | `feedback-smtp.<region>.amazonses.com`, 10 |
| TXT  | `send`                     | `v=spf1 include:amazonses.com ~all`        |

Copy the exact values from Resend, not from this table. At GoDaddy: My Products,
the domain, DNS, Add New Record. GoDaddy appends the domain to the name, so type
`send`, not `send.fantasy-oscars.com`.

Do **not** touch:

- the apex `@` MX records (ImprovMX);
- the apex `@` TXT `v=spf1 ...` record (ImprovMX). There must only ever be one SPF
  record at the apex; Resend's SPF goes on `send`, which is a different name.

Then add DMARC (or, if a `_dmarc` TXT record already exists, edit it instead of
adding a second one):

| Type | Name     | Value                                                     |
| ---- | -------- | --------------------------------------------------------- |
| TXT  | `_dmarc` | `v=DMARC1; p=none; rua=mailto:support@fantasy-oscars.com` |

`p=none` only reports. After a few weeks of clean aggregate reports (they arrive at
`support@` as zipped XML), tighten to `p=quarantine`.

Back in Resend, Verify DNS records. Propagation usually takes minutes, sometimes a
few hours. The domain must show **Verified** before the API can send.

### 4. Create the API key and put it on the VPS

Resend, API Keys, Create API key: name `fantasy-oscars-api`, permission **Sending
access**, domain `fantasy-oscars.com`. Copy it once (it is shown only once) into the
password manager, then on the server:

```bash
sudo -u deploy nano /srv/fantasy-oscars/.env   # set RESEND_API_KEY=re_...
```

Redeploy (run the deploy workflow) so the `api` container is recreated with the new
environment. `MAIL_FROM`, `MAIL_REPLY_TO` and `WEB_BASE_URL` can stay unset to use
the defaults.

### 5. Verify delivery

1. Register (or use) a test account with a Gmail address, sign out, and use
   "Forgot password?" on the sign-in screen.
2. The email should arrive within a minute, in the inbox, from
   `no-reply@fantasy-oscars.com`. In Gmail, Show original: SPF, DKIM and DMARC all
   `PASS`.
3. Follow the link, set a new password, sign in with it.
4. Repeat with an Outlook.com address (change the test account's email from the
   account page first). Outlook is the stricter of the two; if the message lands in
   Junk, check that DKIM passes and that the domain is verified.
5. In Resend, Emails: both sends show **Delivered**.

If nothing arrives: `docker compose -p fantasy-oscars logs --since 15m api` and look
for `password_reset_email_failed` (Resend refused the request; the line carries the
HTTP status) or `mail_not_configured` (the key did not reach the container).

### 6. Send as support@ from Gmail

ImprovMX forwards `support@` and the other aliases to the owner's Gmail. To reply
from those addresses, use Resend's SMTP relay:

1. Resend, API Keys: create a second key, `gmail-smtp`, **Sending access**, domain
   `fantasy-oscars.com`. Keep it separate from the API's key so either can be revoked
   alone.
2. Gmail, Settings, Accounts and Import, Send mail as, Add another email address:
   name `Fantasy Oscars`, address `support@fantasy-oscars.com`, untick "Treat as an
   alias" if replies should go to `support@`.
3. SMTP server `smtp.resend.com`, port `587` (TLS), username `resend`, password the
   `gmail-smtp` key.
4. Gmail sends a confirmation code to `support@`, which ImprovMX forwards back to the
   inbox. Enter it.
5. Repeat for each alias (for example `contact@`, `feedback@`), reusing the same SMTP
   settings.

These messages count toward the same daily and monthly limits.

## Daily cap (100 a day) and monthly cap (3,000)

When a cap is reached Resend refuses further sends with HTTP `429` until the window
resets. The player still sees the normal "If an
account uses that address..." message; the API logs `password_reset_email_failed`
with the status and reports it to Sentry. Nothing is queued or retried.

1. Check Resend, Emails (or Usage) to confirm the cap and look for abuse: many sends to
   one address or from one pattern. The API already limits requests to 3 per hour per
   address and 10 per 15 minutes per IP.
2. If it is abuse, block the source at the edge (Caddy or ufw) and wait for the reset.
3. If it is real demand (for example ceremony night), either wait for the reset and
   help urgent cases by hand ([admin.md](admin.md#help-a-player-who-lost-access)), or
   upgrade the Resend plan for the month.
4. Gmail "Send mail as" traffic counts too; avoid bulk replies on a busy day.

## Rotating the key

Create a new sending-only key, replace `RESEND_API_KEY` in `.env`, redeploy, send a
test reset, then delete the old key in Resend.
