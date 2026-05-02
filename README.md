# KONEK 🔗
**Solana x QRIS Payment Bridge**

![Colosseum Frontier Hackathon](https://img.shields.io/badge/Hackathon-Colosseum_Frontier-14F195?style=flat-square)
![Superteam Indonesia](https://img.shields.io/badge/Track-Superteam_Indonesia-9945FF?style=flat-square)

Konek is a Web3 consumer app built to drive crypto mass adoption in Indonesia.
It allows users to scan standard QRIS codes at local merchants and pay using
their Solana wallets (Phantom). The protocol instantly settles the transaction
in fiat (IDR) to the merchant's bank account.

---

## How It Works

1. **Scan** — Web app scans a QRIS code via device camera.
2. **Quote** — Backend fetches real-time SOL/IDR oracle pricing.
3. **Sign** — User approves the exact SOL/USDC amount via Phantom Wallet.
4. **Verify** — Backend confirms the transaction signature on Solana.
5. **Settle** — Midtrans Iris API disburses IDR directly to the merchant.

---

## Tech Stack

| Layer | Tools |
|---|---|
| Frontend | Vite, React, TailwindCSS |
| Web3 | `@solana/web3.js`, `@solana/wallet-adapter` |
| Database | Supabase (PostgreSQL) |
| Fiat Gateway | Midtrans Sandbox API |

---

## Local Development

### 1. Clone the repository

```bash
git clone https://github.com/justhenix/konek.git
cd konek
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy `.env.example` to `.env.local` in the project root and fill in real values.
Request the keys from the Lead Architect (`@justhenix`).

> **DO NOT commit `.env.local`.** It is already in `.gitignore`.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SOLANA_RPC_URL=
MIDTRANS_SERVER_KEY=
NEXT_PUBLIC_TREASURY_WALLET=
```

| Variable | Source | Scope |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → URL | Public (browser OK) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` `public` key | Public (browser OK) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key | **Backend only** ⚠️ |
| `SOLANA_RPC_URL` | Your Solana RPC provider (Helius, QuickNode, etc.) | Backend only |
| `MIDTRANS_SERVER_KEY` | Midtrans Dashboard → Server Key | Backend only |
| `NEXT_PUBLIC_TREASURY_WALLET` | Your Solana wallet public key | Public (browser OK) |

> **Security:** `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security and must
> **never** be imported in `src/` (browser-bundled code). It is only used inside
> `api/lib/` by Vercel serverless functions.

> **Restart:** After editing `.env.local`, restart the dev server (`npm run dev`
> or `vercel dev`) for changes to take effect.

### 4. Run the development server

```bash
npm run dev
```

For full-stack local dev with serverless functions:

```bash
npx vercel dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Backend Architecture

Serverless functions live in `api/` and run on Vercel:

```
api/
├── lib/
│   ├── supabaseAdmin.js   ← Server-only Supabase client (service_role)
│   └── transactions.js    ← Reusable DB helpers (CRUD on transactions table)
└── v1/
    └── payment/
        └── quote.js       ← POST /api/v1/payment/quote
```

> `api/lib/` is **not** deployed as routes — only `api/v1/**` are callable endpoints.
> The lib modules are imported by handlers.

---

> Built for the [Colosseum Frontier Hackathon](https://colosseum.org/) — Superteam Indonesia Track.