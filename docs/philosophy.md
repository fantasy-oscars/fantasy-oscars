# UI System Philosophy

This codebase follows a theme-first, system-driven UI architecture.

## Principles

- **Theme is the single source of truth.** Visual values (color, spacing, radius, typography, shadow) must come from theme-defined CSS variables.
- **Feature code does not import Mantine directly.** Mantine is accessed only through local wrappers in `apps/web/src/ui/`.
- **Tokens over literals.** Avoid raw `px`, `rem`, hex colors, and ad hoc `rgba(...)` values in feature code.
- **Semantic intent over implementation.** Prefer semantic variants (e.g. "primary") over low-level variants (e.g. "filled") where wrappers support them.
- **Stability for brittle surfaces.** The draft room is intentionally layout-sensitive; changes to its spacing and sizing must be reasoned and incremental.

## What belongs where

- **Theme & tokens:** `apps/web/src/theme/`
- **UI wrappers / primitives:** `apps/web/src/ui/`
- **App-level providers:** `apps/web/src/ui/AppProviders.tsx`

