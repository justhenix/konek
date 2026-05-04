# KONEK

**Solana x QRIS payment bridge for Indonesia**

![Colosseum Frontier Hackathon](https://img.shields.io/badge/Hackathon-Colosseum_Frontier-14F195?style=flat-square)
![Superteam Indonesia](https://img.shields.io/badge/Track-Superteam_Indonesia-9945FF?style=flat-square)
![Vite](https://img.shields.io/badge/Frontend-Vite_React-646CFF?style=flat-square)
![Solana](https://img.shields.io/badge/Network-Solana-14F195?style=flat-square)

KONEK is a hackathon prototype for paying standard Indonesian QRIS merchants
from a Solana wallet. The app scans an EMVCo QRIS code, extracts the merchant
and IDR amount, and provides a wallet-first payment flow designed for consumer
crypto adoption. The backend includes a live SOL/IDR quote endpoint for the
payment flow.

The goal is simple: make a Solana payment feel as familiar as scanning a QRIS
code at a local cashier.

## Current Status

This repository is an active prototype built for the Colosseum Frontier
Hackathon, Superteam Indonesia track.

Implemented:

- QRIS scanning in the browser with device camera support.
- EMVCo TLV parsing for QRIS payloads.
- Phantom wallet connection on desktop and mobile deeplink flow.
- Live SOL/IDR quote endpoint using Pyth Hermes price feeds.
- Server-side quote validation that parses QRIS Tag 54 directly.
- Supabase server-only helper modules for transaction persistence.
- Vercel serverless API structure.

In progress:

- Creating and signing the final Solana transfer transaction.
- Verifying submitted Solana transaction signatures.
- Persisting full payment lifecycle states from quote to settlement.
- Midtrans Iris disbursement integration for fiat merchant settlement.

## How It Works

1. **Scan** - The user scans a QRIS code through the web app.
2. **Parse** - The app reads the EMVCo TLV payload and extracts merchant and amount data.
3. **Quote** - The backend validates the QRIS payload and derives SOL/IDR from Pyth price feeds.
4. **Review** - The user reviews the merchant, IDR amount, and quoted SOL amount.
5. **Pay and settle** - The intended production flow signs on Solana, verifies the transaction, and settles IDR to the merchant.

## Tech Stack

| Layer | Tools |
| --- | --- |
| Frontend | Vite, React, Tailwind CSS |
| QR scanning | `html5-qrcode` |
| Web3 | `@solana/web3.js`, Solana Wallet Adapter, Phantom |
| Pricing | Pyth Network Hermes, USD/IDR fallback API |
| Backend | Vercel Serverless Functions |
| Database | Supabase Postgres |
| Fiat gateway | Midtrans Iris API |

## Project Structure

```text
api/
  lib/
    supabaseAdmin.js      Server-only Supabase client
    transactions.js       Transaction database helpers
  v1/
    payment/
      quote.js            POST /api/v1/payment/quote

src/
  components/
    WalletContextProvider.jsx
  utils/
    parseEmvcoQris.js     EMVCo QRIS parser
  App.jsx                 Main landing and wallet flow
  QrisScanner.jsx         Camera QR scanner
  PaymentPage.jsx         QRIS review screen
```

## API

### `POST /api/v1/payment/quote`

Creates a short-lived SOL quote from a QRIS payload.

Request:

```json
{
  "qrisPayload": "000201..."
}
```

Successful response:

```json
{
  "quoteId": "4f0f9a1e-...",
  "solAmount": "0.012345678",
  "exchangeRate": "2500000",
  "fiatAmount": 50000,
  "fiatCurrency": "IDR",
  "expiresAt": "2026-05-04T01:02:03.000Z",
  "createdAt": "2026-05-04T01:00:03.000Z"
}
```

The endpoint does not trust client-provided fiat amounts. It parses QRIS Tag 54
on the server and rejects malformed, missing, or unsupported payloads.

## Getting Started

### Prerequisites

- Node.js 20 or newer
- npm
- Phantom Wallet for wallet testing
- Optional: Vercel CLI for local serverless API testing

### Install

```bash
git clone https://github.com/justhenix/konek.git
cd konek
npm install
```

### Configure environment variables

Copy the example environment file:

```bash
cp .env.example .env.local
```

Fill in the values you need for the parts of the stack you are running.

| Variable | Used by | Required for | Visibility |
| --- | --- | --- | --- |
| `VITE_SOLANA_RPC_URL` | Frontend wallet provider | Optional custom Solana devnet RPC | Public |
| `VITE_TREASURY_WALLET` | Frontend payment flow | Destination wallet display | Public |
| `VITE_PUBLIC_SUPABASE_URL` | Serverless API and future frontend reads | Supabase project URL | Public |
| `VITE_PUBLIC_SUPABASE_ANON_KEY` | Future frontend Supabase reads | Browser-safe Supabase access | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Serverless API only | Transaction admin operations | Secret |
| `SOLANA_RPC_URL` | Future server verification | Backend Solana reads | Secret |
| `MIDTRANS_SERVER_KEY` | Future settlement API | Midtrans Iris disbursement | Secret |

Security notes:

- Never commit `.env.local`.
- Never import `SUPABASE_SERVICE_ROLE_KEY` into files under `src/`.
- The Supabase service role key bypasses Row Level Security and must only be used in serverless functions.
- Restart the dev server after changing environment variables.

### Run the app

Frontend only:

```bash
npm run dev
```

Full-stack local development with Vercel serverless functions:

```bash
npx vercel dev
```

Vite usually serves the frontend at:

```text
http://localhost:5173
```

`vercel dev` usually serves the full app and API at:

```text
http://localhost:3000
```

## Scripts

```bash
npm run dev       # Start the Vite development server
npm run build     # Build the production frontend bundle
npm run preview   # Preview the production build locally
npm run lint      # Run ESLint
```

## Deployment

The project is configured for Vercel:

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- API routes: `api/**`

Set the same environment variables in your Vercel project settings before
deploying any API-backed flow.

## QRIS Parser

The QRIS parser lives in `src/utils/parseEmvcoQris.js`. It reads EMVCo TLV tags
and exposes the fields used by the payment review flow, including:

- Tag `54` - transaction amount
- Tag `59` - merchant name
- Tag `53` - currency code

The backend quote endpoint has its own validation path so pricing cannot be
manipulated by client-side state.

### QRIS test payloads

QRIS does not have a Solana devnet. Use Midtrans Sandbox or Xendit Test Mode to
generate QRIS test payloads. KonekPay uses the QRIS payload for merchant/amount
parsing, then verifies the Solana devnet payment separately.

## Roadmap

- Build the Solana transfer instruction and signature submission flow.
- Add backend transaction verification against the configured Solana RPC.
- Persist quote, payment, verification, and settlement states in Supabase.
- Add Midtrans Iris payout execution and settlement reconciliation.
- Add automated parser and quote endpoint tests.
- Add deployment screenshots and production demo links.

## Contributing

Issues and pull requests are welcome. For larger changes, open an issue first
with the proposed behavior, affected files, and any security assumptions.

Before opening a pull request:

```bash
npm run lint
npm run build
```

## Acknowledgements

Built for the [Colosseum Frontier Hackathon](https://colosseum.org/) in the
Superteam Indonesia track.
