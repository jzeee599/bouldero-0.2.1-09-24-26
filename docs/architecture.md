# Bouldero: Milestone 2D

## Scope

Milestone 2D preserves sessions, count-only lines, photo reuse, and library organization, then adds a history timeline. The client joins the already owner-scoped session, attempt, and project rows: sessions form the timeline, attempts contribute results and notes, and project IDs supply line metadata and photos. No aggregate table or duplicated history data is introduced.

## Minimal architecture

- Next.js App Router, React, TypeScript. One client workspace with three views: projects, new project/hold editor, saved project. No separate backend server or state library.
- `components/bouldero.tsx`: view state and small forms/cards.
- `components/hold-map.tsx`: responsive image and pointer/keyboard interactions.
- `lib/coordinates.ts`: normalized geometry and ordering.
- `lib/photo.ts`: orientation normalization and compression.
- `lib/storage.ts`: anonymous Supabase identity, private photo storage, transactional project creation; explicit IndexedDB local mode when credentials are absent.
- Client identity/data loading prevents personal data from entering a shared static-render cache. Never include a service-role key in the client.
- Web manifest and standalone iOS metadata. Offline app-shell caching and background synchronization are deliberately not implemented; local persistence is not a guarantee that the app loads offline.

## Supabase schema proposal

| Table    | Fields                                                                         | Milestone |
| -------- | ------------------------------------------------------------------------------ | --------- |
| users    | id → auth.users, created_at                                                    | 1         |
| projects | id, user_id, name, grade, gym, photo_url, status, route_mode, source_project_id, created_at, sent_at | 1 + 2B |
| holds    | id, project_id, order_index, x, y, is_top, created_at                          | 1         |
| climbing_sessions | id, user_id, gym, started_at, ended_at                               | 2A        |
| attempts | id, user_id, project_id, session_id, result, notes, created_at                 | 2A        |

`photo_url` stores a private bucket path rather than an expiring URL. Reads obtain a signed URL. All implemented tables and storage objects have owner-only RLS. The create RPC uses invoker rights and commits project + holds atomically. A failed database creation triggers best-effort photo cleanup. Storage and Postgres cannot share a transaction; a network interruption can leave an orphan photo, requiring a later cleanup job if production scale warrants it.

Attempts are accepted only while their owner’s session is active. A partial unique index allows one active session per user. Row-level policies verify ownership of the attempt, project, and session. Reached-hold tracking remains a later extension if field testing shows it is faster than notes.

## Photo and coordinate risks

1. **Letterboxing/cropping:** mapping images use block `width:100%; height:auto`, never a fixed-height `object-fit` box. The enclosing element has the image's actual bounds. Thumbnails can crop because they have no markers.
2. **Orientation:** browser decoding and a canvas bake EXIF rotation into the JPEG before mapping. Unsupported HEIC yields a clear conversion message. Verify actual iPhone camera output before declaring device support complete.
3. **Resolution/memory:** uploads are limited to 30 MB and resized to 2000 pixels on the longest side. Very large decoded images can still stress older phones; validate a real camera image on the target phone.
4. **Drag/scroll conflict:** only marker hit targets suppress touch scrolling. Pointer capture retains drags outside the marker; positions are clamped to [0,1]. A small dot marks the exact location and its number sits above it.
5. **Edges/density:** 44px marker targets can overlap when holds are close. Mapping is precise setup work. Test dense real routes before designing the later fast attempt interface.
6. **Persistence:** IndexedDB stores the same compressed Blob and coordinates together. Browser data clearing removes local projects; anonymous cloud identity is also tied to this browser until a future account-linking feature exists.
7. **Expired photos:** signed URLs last 24 hours and refresh when the project list is loaded again. A failed image gives a retry instruction.

## Implementation plan / acceptance gate

1. Scaffold a mobile-first shell and project creation form.
2. Decode/compress upload; immediately expose mapping beside details.
3. Add sequential markers, drag, keyboard movement, undo latest, delete/reorder, optional final TOP.
4. Persist photo and holds locally and through an authenticated Supabase RPC.
5. Reopen a project after reload; compare 15 marker positions against expected normalized values at phone and desktop widths.
6. Test delete/undo/TOP consistency, portrait/landscape, bounds, validation, keyboard movement, and save failure recovery.
7. Manually validate a real iPhone camera photo, then run the same round trip with configured Supabase and a second identity to confirm isolation.

Later milestones can build on these IDs without changing existing sessions or attempts.

For local storage, only the source project stores the photo Blob; reused lines store `source_project_id`. In Supabase, reused rows retain the owner-only Storage path selected from their source. The V2 creation RPC verifies source ownership and enforces at least one hold for mapped lines and zero holds for count-only lines.

Reference: [Next.js App Router](https://nextjs.org/docs), [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
