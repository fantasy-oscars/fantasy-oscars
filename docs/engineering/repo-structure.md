# Repo Structure

This repo is a pnpm monorepo with two primary apps:

- `apps/web`: React + Vite frontend
- `apps/api`: Express API service

The goal of the structure is to make it obvious where code lives, and to keep
UI primitives separate from feature UI and route wiring.

## apps/web/src

- `app/`
  - Route wiring, layout shells, and app-level chrome.
  - Treat this as "composition": it should mostly import from `features/` and `shared/`.
- `features/`
  - Feature-focused UI (domain UI and feature-level helpers).
  - A feature folder may contain UI components, small feature-only utilities, and
    feature-only view models.
- `shared/`
  - Reusable app-level building blocks that are not "design system primitives"
    (e.g. small helpers, common layout helpers, comboboxes, drag helpers).
- `ui/`
  - Mantine wrapper layer only.
  - Feature code should not import from `@mantine/*` directly.
- `theme/`
  - Theme configuration and the CSS variable token map (`cssVariablesResolver`).
- `primitives/`
  - CSS that defines the baseline look/feel and non-component primitives.
- `tokens/`
  - Non-visual constants used for layout math and runtime tuning (e.g. tooltip offsets).
- `assets/`
  - Static assets used by the web app.

### Import conventions

Use the `@/` alias for app-internal imports rooted at `apps/web/src` to avoid
brittle relative paths when files move:

```ts
import { useAuthContext } from "@/auth/context";
import { ShellHeader } from "@/app/chrome/ui/ShellHeader";
import { FormStatus } from "@/shared/forms";
```

Prefer `@ui` for Mantine wrappers:

```ts
import { Box, Button, Text } from "@ui";
```

## apps/api/src

API is organized by layer:

- `routes/`: HTTP handlers and request/response glue
- `services/`: orchestration and business logic (drafting, benchmarking, etc.)
- `data/`: database access (repositories, SQL)
- `domain/`: domain types and invariants
- `lib/` + `utils/`: shared utilities and third-party adapters

