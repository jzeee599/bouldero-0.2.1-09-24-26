# Milestone 1 verification

## Automated checks

- `pnpm typecheck`: passed.
- `pnpm build`: passed with Next.js 16.3.5 in Webpack mode, including static generation of `/` and `/manifest.webmanifest`.
- Playwright Chromium: **4 tests passed**.
  - 15 holds saved, page reloaded, project reopened, and marker alignment checked at phone, desktop, landscape, and 320px widths.
  - Dragging, keyboard movement, bounds clamping, delete/reorder, undo, and TOP behavior.
  - Required-field validation and recovery from a simulated storage failure.
  - Invalid-image error handling.

The Vercel build uses Node.js 22 through `package.json`. The development machine currently provides Node.js 24, so local pnpm prints an engine warning; compilation and tests still pass. Vercel will not show that mismatch.

## Remaining acceptance checks

- Upload a real photo taken by the target iPhone; confirm its orientation and manually check hold alignment after closing/reopening.
- Configure a Supabase project, apply the migration, and perform a cloud save/reopen round trip.
- Use a second anonymous identity to confirm database and Storage owner isolation against the deployed policies.
- Test route photos with closely spaced holds and touches with an actual finger.

These checks cannot be replaced by synthetic browser fixtures.

## Milestone 2A verification — 2026-09-23

- `pnpm typecheck`: passed.
- `pnpm build`: passed with Next.js 16.3.5 in Webpack mode.
- Playwright Chromium: **5 tests passed**, including all four V1 regression tests.
- The new end-to-end test creates a gym-tagged line, starts a session, records a Sent attempt with notes, reloads, and verifies the attempt remains visible.
- IndexedDB upgrades from version 1 to 2 without replacing the existing `projects` store.
- The cloud path adds owner-only session and attempt tables through `002_sessions_attempts.sql`.

## Milestone 2B verification — 2026-09-23

- TypeScript check passed.
- Six Playwright tests passed, including all V1 and 2A regressions.
- The 2B test creates a second line from an existing photo, saves it in count-only mode with zero holds, verifies IndexedDB stores no duplicate Blob, and records two attempts as its count.
- The cloud migration adds mode constraints and an owner-checked photo-reuse RPC.

## Milestone 2C verification — 2026-09-23

- TypeScript check passed.
- Seven Playwright tests passed, including all V1, 2A, and 2B regressions.
- The 2C test marks a line completed, finds it through the Completed filter, changes to list view, filters by gym, searches, archives the line, and restores it to Ongoing.
- Status changes update IndexedDB locally or the owner-protected `projects` row in Supabase.

## Milestone 2D verification — 2026-09-23

- TypeScript check passed.
- Eight Playwright tests passed, including all previous milestone regressions.
- The 2D test creates a line, starts a gym session, records a Sent attempt with notes, ends the session, verifies timeline counts and notes, then opens the line and verifies cross-session progress.
- History is derived from existing owner-scoped sessions, attempts, and lines, so no database migration is required for 2D.
