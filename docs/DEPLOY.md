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

Vercel setup comes in a later stage.
