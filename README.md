# Bark Trails

Next.js + TypeScript (App Router) app with InstantDB.

## InstantDB Setup

1. Create an InstantDB app at [InstantDB](https://instantdb.com).
2. Paste your keys into `.env.local`:
   - `INSTANTDB_APP_ID` — your InstantDB App ID.
   - `INSTANTDB_ADMIN_TOKEN` — from your InstantDB app dashboard.
   - `NEXT_PUBLIC_INSTANTDB_APP_ID` — same as `INSTANTDB_APP_ID` (only needed if you use the client/realtime elsewhere).
3. Run `npm run dev`.
4. Visit `/debug`.
5. Click **Seed DB** to insert sample city, trail, and trailhead.
