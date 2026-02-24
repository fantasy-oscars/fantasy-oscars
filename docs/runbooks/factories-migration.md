# Test Factory Migration Plan (Issue #86)

Target shared location

- Use the existing shared package: `packages/shared/`.
- Add a test-only path `packages/shared/src/testing/factories/` (not yet created; to be added when migrating).
- Re-export factory builders through `packages/shared/src/testing/factories/index.ts` for easy imports in apps.

Migration steps (not executed yet)

1) Create `packages/shared/src/testing/factories/` and move common builders from `apps/api/tests/factories/`.
2) Keep API-only factories (e.g., ones that hit DB directly) in `apps/api/tests/factories/` and adapt imports.
3) Update import paths in tests to use the shared package alias (e.g., `@fantasy-oscars/shared/testing/factories`).
4) Add a small README in the shared factories folder documenting boundaries: pure domain/data-shape factories only; DB or HTTP helpers stay app-local.
5) Run `pnpm -r --if-present test` to ensure cross-workspace tests pass after path changes.

Notes

- This ticket only captures the plan and target location; actual file moves are out of scope here.
