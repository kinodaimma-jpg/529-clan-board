# 5-29 Clan Board — Cloudflare Pages migration

## Included
- Existing `index.html` and current board UI
- Existing API logic, adapted to receive Cloudflare environment bindings
- Cloudflare Pages catch-all Function at `functions/api/[[path]].js`
- `_routes.json` so only `/api/*` requests invoke the Function
- `wrangler.toml` with Node.js compatibility

## Important
- Keep the existing Supabase project and database. No SQL migration is required for hosting migration.
- Do not delete the Netlify site until Cloudflare is tested.
- Add these Cloudflare Pages secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLAN_PASSWORD`, `SESSION_SECRET`, `ADMIN_PASSWORD`.
- Secrets must be configured in Cloudflare dashboard under Workers & Pages > project > Settings > Variables and Secrets, then redeploy.
- Deploy through Git integration or Wrangler. Cloudflare Pages dashboard Direct Upload does not support Functions.

## Suggested Pages settings
- Framework preset: None
- Build command: leave blank
- Build output directory: `.`
- Root directory: `529-clan-board` (if repository contains this folder at top level)
