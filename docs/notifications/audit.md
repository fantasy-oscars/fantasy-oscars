# Notification Surfaces Audit

Scope: user-facing messaging via banners, toasts, alerts, inline messages, confirmations/modals, inbox items, and global message surfaces.

This audit enforces the canonical taxonomy and decision tree defined in `docs/notifications/policy.md`.

## Notification Surfaces Inventory

### A) Broadcast Banner
- **CMS banners (admin-managed announcements):** `apps/web/src/layout/ShellLayout.tsx` (renders `BannerStack`)
- **Runtime broadcast banners (system/async feedback):**
  - Provider: `apps/web/src/notifications/runtimeBanners.tsx` (`RuntimeBannerProvider`)
  - Stack region:
    - Main chrome: `apps/web/src/layout/ShellLayout.tsx` (`RuntimeBannerStack`)
    - Draft chrome: `apps/web/src/screens/draft/DraftRoomScreen.tsx` (`RuntimeBannerStack`)

### B) Toast
- **Mantine notifications container:** `apps/web/src/main.tsx` (`<Notifications />`)
- **Dispatcher:** `apps/web/src/notifications/notify.ts` (routes user-action outcomes to toast)

### C) Inline Alert (Anchored)
- **Form-level inline alerts:** `apps/web/src/ui/forms.tsx` (`FormStatus`)
- **Page-level error surface:** `apps/web/src/ui/page-state.tsx` (`PageError`)
- **Screen-local alerts:** various screens use Mantine `<Alert>` for anchored errors:
  - `apps/web/src/screens/invites/InvitesInboxScreen.tsx`
  - `apps/web/src/screens/seasons/SeasonsIndexScreen.tsx`
  - `apps/web/src/screens/HomeScreen.tsx` (season load errors)

### D) Confirmation Modal
- **Provider / canonical modal:** `apps/web/src/notifications/confirm.tsx` (`ConfirmProvider`)
- **Usage sites (intent only; outcomes routed to Toast):**
  - `apps/web/src/orchestration/leagues.ts`
  - `apps/web/src/pages/SeasonPage.tsx`
  - `apps/web/src/pages/admin/users/AdminUserDetailPage.tsx`
  - `apps/web/src/pages/admin/content/AdminDynamicContentEditorPage.tsx`
  - `apps/web/src/pages/admin/content/AdminDynamicContentLedgerPage.tsx`
  - `apps/web/src/pages/admin/ceremonies/AdminCeremoniesLockPage.tsx`
  - `apps/web/src/pages/admin/ceremonies/AdminCeremonyHomePage.tsx`
  - `apps/web/src/screens/draft/DraftRoomScreen.tsx` (single-click draft pick confirmation)

### E) Inbox Notification (Durable)
- **Invites inbox (durable, reviewable async events):**
  - Page: `apps/web/src/pages/InvitesInboxPage.tsx`
  - Screen: `apps/web/src/screens/invites/InvitesInboxScreen.tsx`
  - Orchestration: `apps/web/src/orchestration/invites.ts` (`/seasons/invites/inbox`)

### F) Blocking System Alert (Rare)
- **Routing exists:** `apps/web/src/notifications/decisionTree.ts` + `apps/web/src/notifications/notify.ts`
- **Surface:** runtime banner with `expires_at: null` (persistent until dismissed)
- **Current usage:** reserved for `severity: "critical"` events; should remain rare.

## Audit Table (Dynamic Messaging Instances)

This table covers **dynamic** user messaging routed through the canonical policy layer (`notify()` / `confirm()`), plus the durable inbox.

### Toast / Banner Instances (`notify(event)`)

Source of truth: `apps/web/src/notifications/notify.ts` routes these by decision tree.

| Location | Trigger | Current Surface | Canonical Type | Event ID | Copy (representative) | Compliance |
|---|---|---|---|---|---|---|
| `apps/web/src/pages/InvitesInboxPage.tsx` | user action | Toast | B Toast | `invites.inbox.accepted` | Invite accepted | COMPLIANT |
| `apps/web/src/pages/InvitesInboxPage.tsx` | user action | Toast | B Toast | `invites.inbox.declined` | Invite declined | COMPLIANT |
| `apps/web/src/pages/InvitesInboxPage.tsx` | user action | Toast | B Toast | `invites.inbox.accept.failed` / `invites.inbox.decline.failed` | (API error mapped) | COMPLIANT |
| `apps/web/src/pages/InviteClaimPage.tsx` | user action | Toast | B Toast | `invites.claim.accepted` / `invites.claim.declined` | Invite accepted/declined | COMPLIANT |
| `apps/web/src/pages/InviteClaimPage.tsx` | user action | Toast | B Toast | `invites.claim.accept.failed` / `invites.claim.decline.failed` | (invite error mapped) | COMPLIANT |
| `apps/web/src/orchestration/seasons.ts` | user action | Toast | B Toast | `season.invite.create.success` | Invite created (user must accept in app) | COMPLIANT |
| `apps/web/src/orchestration/seasons.ts` | user action | Toast | B Toast | `season.*.update.success` | Scoring/Allocation/Timer updated | COMPLIANT |
| `apps/web/src/orchestration/adminCeremonies.ts` | user action | Toast | B Toast | `admin.ceremony.publish.success` | Ceremony published. | COMPLIANT |
| `apps/web/src/orchestration/adminCeremonies.ts` | user action | Toast | B Toast | `admin.ceremony.lock.success` | Ceremony locked | COMPLIANT |
| `apps/web/src/orchestration/adminCeremonies.ts` | user action | Toast | B Toast | `admin.ceremony.archive.success` | Ceremony archived | COMPLIANT |
| `apps/web/src/orchestration/draft.ts` | user action | Toast | B Toast | `draft.pick.submitted` | Pick submitted | COMPLIANT |
| `apps/web/src/orchestration/draft.ts` | user action | Toast | B Toast | `draft.start.ok` / `draft.pause.ok` / `draft.resume.ok` | Draft started/paused/resumed | COMPLIANT |
| `apps/web/src/orchestration/draft.ts` | async system event | Broadcast Banner | A Banner | `draft.autopick.expired` | Auto-picked … | COMPLIANT |
| `apps/web/src/orchestration/draft.ts` | async system event | Broadcast Banner | A Banner | `draft.completed.transition` | Draft complete! Moving to roster view. | COMPLIANT |
| `apps/web/src/orchestration/draft.ts` | async system event | Broadcast Banner | A Banner | `ceremony.winner.updated` | (category + winner) | COMPLIANT |

Notes:
- “Draft autopicked” and “Winners updated” are **async** events and are routed to **Broadcast Banner**, not Toast, to avoid duplicating user-action outcomes.
- Action outcomes never also appear as a global banner or inbox item.

### Confirmation Modal Instances (`confirm(req)`)

| Location | Trigger | Current Surface | Canonical Type | Intent Copy (representative) | Outcome Surface | Compliance |
|---|---|---|---|---|---|---|
| `apps/web/src/pages/SeasonPage.tsx` | requires decision | Confirmation Modal | D Modal | “Delete this season? … cannot be undone.” | Toast | COMPLIANT |
| `apps/web/src/orchestration/leagues.ts` | requires decision | Confirmation Modal | D Modal | Transfer commissioner / Remove member | Toast | COMPLIANT |
| `apps/web/src/pages/admin/ceremonies/AdminCeremoniesLockPage.tsx` | requires decision | Confirmation Modal | D Modal | Lock / Archive ceremony | Toast | COMPLIANT |
| `apps/web/src/pages/admin/content/*` | requires decision | Confirmation Modal | D Modal | Publish / Unpublish / Delete draft | Toast | COMPLIANT |
| `apps/web/src/screens/draft/DraftRoomScreen.tsx` | requires decision | Confirmation Modal | D Modal | Confirm draft pick | Toast (pick outcome) | COMPLIANT |

### Inbox Notification Instances (Durable)

| Location | Trigger | Current Surface | Canonical Type | Persistence | Compliance |
|---|---|---|---|---|---|
| `apps/web/src/pages/InvitesInboxPage.tsx` + `apps/web/src/screens/invites/InvitesInboxScreen.tsx` | async event (invite received) | Inbox list | E Inbox | stored (server) | COMPLIANT |

## Noncompliance Fixes Applied (High-Signal)

- Removed ad-hoc toast/alert usage by routing through `notify(event)` and `confirm(req)` globally.
- Ensured **success** is not shown via inline alerts (FormStatus is now errors/loading only).
- Ensured async/system draft updates are **Broadcast Banners**, not toasts.
- Ensured invite accept/decline outcomes are **Toast**, and invite receipt remains **Inbox** (no toast+inbox duplication).

## Appendix A: Complete `notify()` Event ID Inventory

These are all current `notify({ ... })` instances in `apps/web/src` (grouped by file). Some copy is dynamic (computed strings) and is therefore omitted here; the file is the source of truth.

- `apps/web/src/orchestration/adminCeremonies.ts`
  - `admin.ceremony.create.success`
  - `admin.ceremony.initialize.save.success`
  - `admin.ceremony.publish.success`
  - `admin.ceremony.lock.success`
  - `admin.ceremony.archive.success`
  - `admin.ceremony.winners.save_all.success`
  - `admin.ceremony.winners.save_all.error`
  - `admin.ceremony.winners.finalize.success`
  - `admin.ceremony.winners.finalize.error`
- `apps/web/src/orchestration/adminCeremoniesCategories.ts`
  - `admin.categories.add.success`
  - `admin.categories.remove.success`
  - `admin.categories.clone.success`
  - `admin.category_template.create.success`
  - `admin.category_template.create_and_add.success`
  - `admin.category_template.update.success`
  - `admin.category_icon.update.success`
- `apps/web/src/orchestration/adminContent.ts`
  - `admin.content.static.save.success`
  - `admin.content.dynamic.publish.success`
  - `admin.content.dynamic.unpublish.success`
  - `admin.content.dynamic.edit.save.success`
  - `admin.content.dynamic.edit.publish.success`
  - `admin.content.dynamic.edit.unpublish.success`
- `apps/web/src/orchestration/adminUsers.ts`
  - `admin.users.role.updated`
- `apps/web/src/orchestration/draft.ts`
  - `draft.pick.submitted`
  - `draft.pick.failed`
  - `draft.start.ok`
  - `draft.start.failed`
  - `draft.pause.ok`
  - `draft.pause.failed`
  - `draft.resume.ok`
  - `draft.resume.failed`
  - `draft.autopick.expired` (async -> banner)
  - `draft.completed.transition` (async -> banner)
  - `ceremony.winner.updated` (async -> banner)
- `apps/web/src/orchestration/leagues.ts`
  - `league.invite.copy.success`
  - `league.member.remove.success`
  - `league.commissioner.transfer.success`
- `apps/web/src/orchestration/seasons.ts`
  - `season.create.success`
  - `season.scoring.update.success`
  - `season.allocation.update.success`
  - `season.timer.update.success`
  - `season.draft.create.success`
  - `season.delete.success`
  - `season.invite.create.success`
  - `season.invite.create.error`
  - `season.invite.link.generate.success`
  - `season.invite.link.regenerate.success`
  - `season.invite.label.save.success`
  - `season.invite.link.copy.success`
  - `season.members.added`
  - `season.members.removed`
- `apps/web/src/pages/admin/ceremonies/AdminCeremoniesIndexPage.tsx`
  - `admin.ceremony.delete.success`
  - `admin.ceremony.delete.error`
- `apps/web/src/pages/InviteClaimPage.tsx`
  - `invites.claim.accepted`
  - `invites.claim.accept.failed`
  - `invites.claim.declined`
  - `invites.claim.decline.failed`
- `apps/web/src/pages/InvitesInboxPage.tsx`
  - `invites.inbox.accepted`
  - `invites.inbox.accept.failed`
  - `invites.inbox.declined`
  - `invites.inbox.decline.failed`
- `apps/web/src/screens/admin/ceremonies/AdminCeremoniesNomineesScreen.tsx`
  - `admin.nominees.film.link.success`
  - `admin.nominees.person.link.success`
  - `admin.nominees.contributor.add.success`
  - `admin.nominees.contributor.remove.success`
