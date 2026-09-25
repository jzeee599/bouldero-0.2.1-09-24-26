# Bouldero

A quiet, mobile-first climbing notebook. **Version 0.2.1:** track mapped or count-only lines in timed gym sessions, record the exact hold reached on every mapped attempt, and review progress on a session timeline.

## Run locally

Requires Node.js 20.9+ and pnpm.

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. Without Supabase settings, the app clearly labels local mode and persists projects/photos in IndexedDB in this browser. There are no seeded projects or made-up attempts.

## Connect Supabase

1. Create a Supabase project.
2. Run all files in `supabase/migrations` in numeric order, or apply them with the Supabase CLI. Existing 2A installations only need migration 003.
3. Enable **Authentication → Sign In / Providers → Anonymous Sign-Ins**.
4. Copy `.env.example` to `.env.local` and set the project URL and **publishable** key. Never use a secret/service-role key.
5. Restart the development server. The footer changes to “Private cloud workspace.”

New projects now use private Supabase Storage and Postgres. Local projects are not silently migrated. Anonymous identity persists in this browser; clearing its auth storage loses access to that identity. Account recovery and cross-device sign-in are out of this milestone's scope. For public deployment, configure Supabase's recommended anonymous-auth abuse protection.

## Use

From Home, choose **Start a session**, enter or pick a gym, and use the live session timer at the top of the page. Open one of that gym's ongoing lines, record each attempt, tap the final hold reached, and add an optional note. Recording a send automatically completes the line. End the session when the climbing day is over. Sessions and attempts remain available after reload.

Choose **New line** and upload/take a photo or reuse a saved wall photo. Then choose **Map holds** to place holds from start to finish, or **Count only** for a warm-up line with no markers. Enter the color and grade; the line name is generated automatically. A mapped line can finish on its last hold or by topping out onto the wall. Reused lines reference the original photo rather than storing another copy. Mapped holds can be dragged, deleted, and undone.

Open **History** to review sessions newest-first. Each entry shows its gym, duration, lines, attempts, sends, and saved notes. The summary shows total sessions, attempts, sends, and the most recent training date; line details show attempts across sessions and completion date.

Use the line library tabs to switch between **Ongoing**, **Completed**, **Archived**, and **All**. Search by line name, grade, or gym; filter to one gym; and switch between thumbnail and list layouts. From a line detail page, mark it completed, archive it, or move it back to ongoing. During an active session, lines from the current gym sort to the top.

## Verify

```sh
pnpm typecheck
pnpm build
pnpm exec playwright install chromium
pnpm test
```

Tests exercise the browser upload/save/reload flow, mapping behavior, validation, session/attempt persistence, count-only lines, and true local photo reuse. See [architecture and acceptance risks](docs/architecture.md) and [verification notes](docs/verification.md).

## Deploy

This repository is configured for Vercel with Node.js 22 and an exact, frozen dependency lockfile. Vercel detects the pnpm lockfile and Next.js preset automatically.

The scripts use Next.js's supported Webpack mode. This keeps local development stable when `node_modules` lives outside the iCloud-synced Documents folder; Vercel runs the same production build command.

1. Push this directory to a GitHub repository.
2. In Vercel, select **Add New → Project**, import the repository, and keep the detected Next.js defaults.
3. For device-local testing, leave the Supabase variables unset and deploy. Each phone/browser stores its own projects in IndexedDB.
4. For shared cloud data, apply all migrations in numeric order, enable anonymous sign-ins, then add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in **Project Settings → Environment Variables** for Production, Preview, and Development.
5. Deploy, open the generated HTTPS URL in iPhone Safari, and optionally use **Share → Add to Home Screen**.

No Vercel build-command, output-directory, or install-command override is needed. HTTPS supports the intended phone experience. The manifest provides standalone launch metadata; offline loading/background sync are not implemented.
