# Setup and deploy

## 1. Create the database (Neon)

1. Sign up at [neon.com](https://neon.com) (free plan) and create a project, region **Europe (Frankfurt)**.
2. Copy the connection string (Dashboard → Connect). It looks like `postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`.
3. Keep it secret: it gives full access to the data. It goes in an environment variable, never in git.

## 2. Load the library (once)

On your computer, from the repo folder, put the **pooled** connection string (host contains `-pooler`) in `.env.local` — it's git-ignored:

```sh
echo 'DATABASE_URL="postgresql://…your Neon string…"' > .env.local
npm install
npm run db:seed
```

The database scripts (`db:seed`, `db:migrate`, `db:backup`, `db:restore`) read `.env.local` and `.env` automatically. `db:seed` creates the tables and imports the 593 books from `seed/library.txt`; it refuses to run if the database already has data, so it can't overwrite anything. If something goes wrong it prints the underlying database error and a hint (wrong password, unknown host, network).

## 3. Deploy on Vercel

1. Vercel → **Add New → Project** → import `miguelalvarezd/books`. Framework: Next.js (detected).
2. **Settings → Environment Variables** (Production): add the variables from the table below.
3. Deploy. Every deploy runs `vercel-build`, which applies any new database migrations before building.

| Variable | Needed | What |
|---|---|---|
| `DATABASE_URL` | always | The Neon connection string |
| `AUTH_MODE` | always | `passcode` or `accounts` (see below) |
| `FAMILY_PASSCODE` | passcode mode | The family code. Not case-sensitive |
| `ADMIN_EMAIL` | accounts mode | Your email. It's let in the first time and becomes admin |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | accounts mode, for Google sign-in | See 4b |
| `RESEND_API_KEY`, `EMAIL_FROM` | accounts mode, for email links | See 4c |
| `APP_URL` | recommended | The public address, e.g. `https://biblioteca.vercel.app` (used in email links and Google redirects) |
| `ANTHROPIC_API_KEY` | optional | Turns on "Rellenar con una foto" (see 7) |

You can switch `AUTH_MODE` at any time (change the variable, redeploy). Family members, history and books stay the same; everyone just signs in again.

## 4. Sign-in

### 4a. Passcode mode (simplest)

Set `AUTH_MODE=passcode` and `FAMILY_PASSCODE`. On a new phone: open the app, type the family code, then tap your name (or "Soy nuevo/a" the first time). The **first person to sign in becomes admin** — do it yourself right after deploying.

- Wrong codes are counted per network: after 8 in 15 minutes that network waits 15 minutes.
- Change the code by changing the variable and redeploying. Phones already signed in stay signed in; to sign everyone out, an admin can deactivate and reactivate people in **Familia**.

### 4b. Accounts mode with Google

1. [Google Cloud Console](https://console.cloud.google.com) → create a project → **APIs & Services → OAuth consent screen**: External, app name "Biblioteca", your email. Add the family's Gmail addresses as test users, or publish the app (only the basic `email` scope is used, which normally needs no Google review).
2. **Credentials → Create credentials → OAuth client ID** → Web application. Authorized redirect URI: `https://<your-domain>/api/auth/google/callback`.
3. Put the client ID and secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, set `AUTH_MODE=accounts` and `ADMIN_EMAIL`.
4. Sign in yourself, then invite each person in **Tu cuenta → Familia → Añadir persona** with their email.

### 4c. Accounts mode with email links

1. Sign up at [resend.com](https://resend.com) (free tier), verify a domain or use their test sender, and create an API key.
2. Set `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `Biblioteca <biblioteca@yourdomain.com>`).
3. People type their email and get a 20-minute, single-use link. Only invited emails receive one; the screen says the same thing either way, so it can't be used to find out who's invited.

Google and email can be on at the same time.

### Security notes

- Sessions last 180 days of use on each phone and are stored as hashes; signing out or being deactivated ends them.
- All data requires a session. Changes are refused if they come from another website.
- Nobody outside the family can see anything, even with the link.

## 5. Backups and exports

**From the app** (Tu cuenta → Exportar):
- *Libros (CSV)* and *Préstamos (CSV)*: semicolon-separated with accents preserved; they open directly in Excel (Spanish settings) and Google Sheets. Anyone signed in can download them.
- *Copia de seguridad completa (JSON)*: everything (books, places, themes, loans, history, family). Admins only, because it includes email addresses. Sign-in sessions are never included.

**Automatic, every week:** `.github/workflows/backup.yml` runs every Sunday and commits `backups/<date>.json` (plus `backups/latest.json`) to the `backups` branch of this private repo.
1. GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**: name `DATABASE_URL`, value = the Neon connection string.
2. **Actions → Weekly backup → Run workflow** once to check it works. GitHub emails you if a run fails.

**Restoring** (e.g. into a new Neon project):

```sh
DATABASE_URL="postgresql://…new, empty database…" npm run db:restore -- backups/2026-11-15.json
```

The restore runs all migrations first and then loads the rows with their original ids. A backup made by an older version of the app still loads into a newer one, because migrations only add columns. It refuses to run on a database that already has data, and refuses backups from a newer version of the app than the one you're running.

Neon also keeps a short restore window of its own (shorter on the free plan), useful for undoing a very recent mistake.

## 6. QR codes

**Explorar → Gestionar habitaciones y estantes → Imprimir códigos QR** shows one code per bookcase (it opens that bookcase's diagram) and one for the app itself. Tap *Imprimir*: on A4 they come out three per row, with a dashed outline to cut along. Open the page from the real address (not localhost) so the codes point to it. Anyone who scans a code still has to sign in.

## 7. Optional: fill in books from a photo

"Rellenar con una foto" reads the title and author from a photo of the cover or spine using the Claude API. It only appears when `ANTHROPIC_API_KEY` is set (create a key at console.anthropic.com; each photo costs a fraction of a cent). `ANTHROPIC_MODEL` can override the model (default `claude-haiku-5-5`).

## 8. Local development

```sh
DATABASE_URL=pglite:./.pglite npm run db:seed   # once
DATABASE_URL=pglite:./.pglite AUTH_MODE=off npm run dev
```

`AUTH_MODE=off` skips sign-in and only works with a local `pglite:` database. To try sign-in locally, use `AUTH_MODE=passcode FAMILY_PASSCODE=test` instead. Open http://localhost:3000, or your computer's IP and port 3000 from a phone on the same Wi-Fi.
