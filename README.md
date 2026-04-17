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
| Frontend | Next.js (App Router), React, TailwindCSS |
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

Create a `.env.local` file in the root directory.
Request the keys from the Lead Architect (`@justhenix`).

> **DO NOT commit this file.**

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SOLANA_RPC_URL=
MIDTRANS_SERVER_KEY=
NEXT_PUBLIC_TREASURY_WALLET=
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

> Built for the [Colosseum Frontier Hackathon](https://colosseum.org/) — Superteam Indonesia Track.