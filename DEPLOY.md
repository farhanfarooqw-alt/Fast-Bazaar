Deployment checklist — get site working on Vercel
------------------------------------------------

1) Ensure code is pushed (done).

2) Set environment variables in Vercel (required):
   - `ADMIN_PASSWORD` (your admin password)
   - `SUPABASE_URL` (your Supabase project URL)
   - `SUPABASE_KEY` (your Supabase anon/service key)

   UI method (recommended):
   - Open https://vercel.com → your project → Settings → Environment Variables
   - Add the three variables above for `Production` (and `Preview` if you want previews).

   CLI method (optional):
   - Install: `npm i -g vercel`
   - Login: `vercel login`
   - Add an env var (interactive for value):
     - `vercel env add ADMIN_PASSWORD production`
     - `vercel env add SUPABASE_URL production`
     - `vercel env add SUPABASE_KEY production`

3) File placement
   - I removed the catch-all route so Vercel will serve static files directly.
   - By default Vercel serves files from the repository root and `public/` if present.
   - If you prefer, put your static HTML/CSS/assets into a single `public/` folder at project root.

4) Trigger a redeploy
   - After adding env vars, trigger a redeploy from the Vercel dashboard or push a new commit/branch:

     ```bash
     git commit --allow-empty -m "Redeploy: set env vars" && git push origin main
     ```

5) Verify
   - Visit your project production URL. Admin login requires the value of `ADMIN_PASSWORD` you added to Vercel.
   - If admin still says "Invalid credentials", ensure there are no extra spaces in the value in Vercel (the code trims values).

Notes & safety
   - Do NOT commit `.env` with secrets. Use `.env.example` for placeholders (already added).
   - I updated `server.js` to prefer `public/` and trimmed `ADMIN_PASSWORD`; I updated `vercel.json` to only route `/api/*` to the server function.

If you want, I can: copy the canonical static files into `public/` for you, or help set env vars via CLI (you'll need to run `vercel login`).
