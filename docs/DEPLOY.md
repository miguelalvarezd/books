# Setup and deploy

This guide grows with each stage. Stage 1 covers the database.

## 1. Create the database (Neon)

1. Sign up at [neon.com](https://neon.com) (free plan) and create a project, region **Europe (Frankfurt)**.
2. Copy the connection string (Dashboard → Connect). It looks like `postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`.
3. Keep it secret: it gives full access to the data. It goes in an environment variable, never in git.

## 2. Load the library (once)

On your computer, from the repo folder:

```sh
npm install
DATABASE_URL="postgresql://…your Neon string…" npm run db:seed
```

This creates the tables and imports the 593 books from `seed/library.txt`. It refuses to run if the database already has data, so it can't overwrite anything.

## 3. Try it locally without Neon

```sh
DATABASE_URL=pglite:./.pglite npm run db:seed
npm test
```

To open the app locally with that database:

```sh
DATABASE_URL=pglite:./.pglite npm run dev
```

Then open http://localhost:3000 (or your computer's IP and port 3000 from your phone, on the same Wi-Fi).

## Optional: fill in books from a photo

"Rellenar con una foto" on the Add book page reads the title and author from a photo of the cover or spine using the Claude API. It only appears when the environment variable `ANTHROPIC_API_KEY` is set (create a key at console.anthropic.com; each photo costs a fraction of a cent). `ANTHROPIC_MODEL` can override the model (default `claude-haiku-5-5`). Without the key, the app works the same and the button is hidden.

Vercel setup comes in a later stage.
