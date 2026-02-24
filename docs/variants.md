# UI Variants

Feature code should use **semantic variants** provided by local wrappers in `apps/web/src/ui/`.

## Button

Import:

- `import { Button } from "@ui";`

Variants:

- `primary`: main user-facing action
- `secondary`: default action
- `ghost`: low-emphasis action
- `danger`: destructive action

Note: a limited subset of Mantine variants may still exist during migration, but new code should prefer semantic variants.

## ActionIcon

Import:

- `import { ActionIcon } from "@ui";`

Variants:

- `ghost`: low-emphasis icon action
- `secondary`: standard icon action
- `danger`: destructive icon action

