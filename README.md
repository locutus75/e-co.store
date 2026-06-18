This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Productie & Database Migratie / Herstel (Restore)

Wanneer de applicatie naar een nieuwe server wordt verhuisd of een database-backup wordt teruggezet (restored), moeten de databasegebruikers en hun rechten correct worden ingesteld. Een herstelde database behoudt namelijk de eigenschappen van de oorspronkelijke eigenaar, waardoor de applicatiegebruiker (`e_co_store_app`) mogelijk geen lees- of schrijfrechten heeft op de bestaande tabellen.

### 1. Database & Gebruiker aanmaken (PostgreSQL)
Als de database of gebruiker nog niet bestaat op de nieuwe server, voer dan de volgende SQL uit als superuser (bijv. `postgres`):

```sql
-- Database aanmaken
CREATE DATABASE e_co_store;

-- Gebruiker aanmaken
CREATE USER e_co_store_app WITH PASSWORD 'K5G47md#gd8!2snghyfuDh';

-- Eigenaar maken
ALTER DATABASE e_co_store OWNER TO e_co_store_app;
```

### 2. Rechten herstellen na Database Restore
Na het terugzetten (restoren) van een back-up (`pg_restore` of SQL-dump) in de database `e_co_store`, moet je de rechten voor `e_co_store_app` op de bestaande tabellen en sequenties herstellen. Maak verbinding met de specifieke database **`e_co_store`** en voer de volgende SQL uit:

```sql
-- Verbinding en schema gebruik toestaan
GRANT CONNECT ON DATABASE e_co_store TO e_co_store_app;
GRANT USAGE ON SCHEMA public TO e_co_store_app;

-- Rechten verlenen op ALLE bestaande tabellen en sequenties
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO e_co_store_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO e_co_store_app;

-- Rechten automatisch verlenen op toekomstige tabellen/sequenties (nodig voor Prisma migraties)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO e_co_store_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO e_co_store_app;
```

### 3. Server Instellingen (.env)
Controleer altijd of `NEXTAUTH_URL` in `.env` exact overeenkomt met de URL waarmee je de applicatie bezoekt (bijvoorbeeld `http://e-co.store:4000` of de HTTPS domeinnaam).
