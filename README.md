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
- Phantom devnet transfer flow.
- Live SOL/IDR quote endpoint using Pyth Hermes price feeds.
- Server-side quote validation that parses QRIS Tag 54 directly.
- Server-side Solana devnet transaction verification against the quote and treasury wallet.
- Supabase server-only helper modules for transaction persistence.
- Vercel serverless API structure.

In progress:

- Persisting full payment lifecycle states from quote to settlement.
- Midtrans Iris disbursement integration for fiat merchant settlement.

## How It Works

1. **Scan** - The user scans a QRIS code through the web app.
2. **Parse** - The app reads the EMVCo TLV payload and extracts merchant and amount data.
3. **Quote** - The backend validates the QRIS payload and derives SOL/IDR from Pyth price feeds.
4. **Review** - The user reviews the merchant, IDR amount, and quoted SOL amount.
5. **Pay and settle** - The intended production flow signs on Solana, verifies the transaction, and settles IDR to the merchant.

## Tech Stack

| Layer        | Tools                                             |
| ------------ | ------------------------------------------------- |
| Frontend     | Vite, React, Tailwind CSS                         |
| QR scanning  | `html5-qrcode`                                    |
| Web3         | `@solana/web3.js`, Solana Wallet Adapter, Phantom |
| Pricing      | Pyth Network Hermes, USD/IDR fallback API         |
| Backend      | Vercel Serverless Functions                       |
| Database     | Supabase Postgres                                 |
| Fiat gateway | Midtrans Iris API                                 |

## Project Structure

```text
api/
  lib/
    supabaseAdmin.js      Server-only Supabase client
    transactions.js       Transaction database helpers
    paymentQuotes.js      Quote generation and HMAC signing
  v1/
    payment/
      quote.js            POST /api/v1/payment/quote
      verify.js           POST /api/v1/payment/verify

src/
  components/
    WalletContextProvider.jsx
  utils/
    parseEmvcoQris.js     EMVCo QRIS parser
    demoQris.js           Synthetic demo QRIS payload generator
    payment.js            Payment formatting helpers
    solanaPayment.js      Solana transaction helpers
  App.jsx                 Main landing and wallet flow
  QrisScanner.jsx         Camera QR scanner + demo/paste input
  PaymentPage.jsx         QRIS review and payment flow
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

### `POST /api/v1/payment/verify`

Verifies a submitted Solana devnet transaction against a backend quote.

Request:

```json
{
  "quoteId": "demo_quote_v1....",
  "signature": "5zy..."
}
```

Successful response:

```json
{
  "status": "PAID_VERIFIED",
  "signature": "5zy...",
  "explorerUrl": "https://explorer.solana.com/tx/5zy...?cluster=devnet"
}
```

Common failures:

| Error | Meaning |
| ----- | ------- |
| `TX_NOT_FOUND` | The signature was not found on Solana devnet. |
| `TX_NOT_FINALIZED` | The transaction is not confirmed or finalized yet. |
| `WRONG_DESTINATION` | The transaction does not pay the configured treasury wallet. |
| `WRONG_AMOUNT` | The transferred lamports do not exactly match the quote. |
| `QUOTE_EXPIRED` | The quote expired before verification. |
| `TREASURY_WALLET_NOT_CONFIGURED` | `TREASURY_WALLET` is missing from backend env. |

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

| Variable                        | Used by                                  | Required for                      | Visibility |
| ------------------------------- | ---------------------------------------- | --------------------------------- | ---------- |
| `VITE_SOLANA_RPC_URL`           | Frontend wallet provider                 | Optional custom Solana devnet RPC | Public     |
| `VITE_TREASURY_WALLET`          | Frontend payment flow                    | Destination wallet display        | Public     |
| `VITE_PUBLIC_SUPABASE_URL`      | Serverless API and future frontend reads | Supabase project URL              | Public     |
| `VITE_PUBLIC_SUPABASE_ANON_KEY` | Future frontend Supabase reads           | Browser-safe Supabase access      | Public     |
| `SUPABASE_SERVICE_ROLE_KEY`     | Serverless API only                      | Transaction admin operations      | Secret     |
| `SOLANA_RPC_URL`                | Serverless payment verification          | Backend Solana devnet reads       | Secret     |
| `MIDTRANS_SERVER_KEY`           | Future settlement API                    | Midtrans Iris disbursement        | Secret     |

### Run the app

Frontend only:

```bash
npm run dev
```

Full-stack local development with Vercel serverless functions:

```bash
npm run dev:vercel
```

This uses `dotenv-cli` to inject `.env.local` into the Vercel dev server so
backend API routes can read `TREASURY_WALLET`, `PAYMENT_QUOTE_SECRET`, and
other non-`VITE_` vars. No manual shell exports needed.

Vite usually serves the frontend at:

```text
http://localhost:5173
```

`vercel dev` usually serves the full app and API at:

```text
http://localhost:3000
```

### Local Vercel dev environment

`.env.local` **must** exist with all required values before testing payments.
Copy `.env.example` to `.env.local` and fill in real keys.

**Pre-flight check:**

```bash
npm run dev:check-env
```

This loads `.env.local` and confirms every required variable is present. Run it
whenever you change `.env.local` or set up a fresh checkout.

**Start full-stack dev:**

```bash
npm run dev:vercel
```

This wraps `vercel dev` with `dotenv-cli -e .env.local`, ensuring all backend
env vars (including `TREASURY_WALLET` and `PAYMENT_QUOTE_SECRET`) are visible
to the serverless API routes.

> **Why not raw `npx vercel dev`?**
> Vercel CLI does not reliably forward non-`VITE_` vars from `.env.local` to
> serverless functions on all platforms. `dotenv-cli` guarantees they are loaded
> into `process.env` before the child process starts.

If you prefer manual exports (e.g. in CI or scripts):

| Shell      | Syntax                                    |
| ---------- | ----------------------------------------- |
| Git Bash   | `export TREASURY_WALLET="FHXQa...MYQTd"` |
| PowerShell | `$env:TREASURY_WALLET="FHXQa...MYQTd"`   |
| cmd.exe    | `set TREASURY_WALLET=FHXQa...MYQTd`      |

But `npm run dev:vercel` is the recommended path.

### Manual payment verification checklist

1. Run `npm run dev:check-env`.
2. Run `npm run dev:vercel`.
3. Use **Demo QRIS** in the scanner.
4. Confirm the generated quote.
5. Pay with Phantom on Solana devnet.
6. Verify the Payment Verified page appears.
7. Open the Explorer receipt.

## Scripts

```bash
npm run dev            # Start the Vite development server
npm run build          # Build the production frontend bundle
npm run preview        # Preview the production build locally
npm run lint           # Run ESLint
npm run dev:vercel     # Start Vercel dev with .env.local injected
npm run dev:check-env  # Validate required env vars in .env.local
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

### Demo QRIS (hackathon testing)

> **Disclaimer:** Why are we using a "Demo QRIS" instead of a real devnet QRIS?
> Standard Indonesian payment gateways (like Xendit or Midtrans) require a registered legal business entity (PT, CV, etc.) to access their QRIS APIs, _even in sandbox mode_. Since KonekPay is a hackathon prototype focused on the Web3 payment bridge (Solana to IDR), we use a synthetic EMVCo payload to simulate the fiat side. This allows us to fully demonstrate the Phantom wallet integration and Solana on-chain logic without getting blocked by real-world fiat gateway KYC requirements.

Camera QR scanning can be unreliable during live demos. KonekPay includes a
built-in **"Use Demo QRIS"** button in the scanner modal that injects a
synthetic EMVCo payload into the parser without needing a camera or a real QRIS
image.

What happens when you click "Use Demo QRIS":

1. A synthetic QRIS payload is generated with a demo merchant name
   (`KANTIN 165 DEMO`) and a fixed IDR amount (`Rp 15.000`).
2. The payload passes through the same `parseEmvcoQris()` parser as a
   camera-scanned QR code. It is not a bypass.
3. The parsed data is sent to the backend `/api/v1/payment/quote` endpoint,
   which re-parses the QRIS payload server-side and fetches a live SOL/IDR
   rate from Pyth Hermes.
4. The Phantom wallet prompt is real — it signs a Solana devnet transfer.
5. The backend `/api/v1/payment/verify` endpoint verifies the devnet
   transaction against the quote.

What is **not** real (currently):

- The demo QRIS does not represent a real merchant acquirer.
- No IDR settlement occurs unless Midtrans/Xendit integration is completed.
- The "KANTIN 165 DEMO" merchant name is synthetic.

You can also paste any valid EMVCo QRIS payload into the manual textarea in the
scanner modal. The parser will validate it and show errors if the payload is
malformed.

## Roadmap

- Build the Solana transfer instruction and signature submission flow.
- Add backend transaction verification against the configured Solana RPC.
- Persist quote, payment, verification, and settlement states in Supabase.
- Add Midtrans Iris payout execution and settlement reconciliation.
- Add automated parser and quote endpoint tests.
- Add deployment screenshots and production demo links.

## Acknowledgements

Built for the [Colosseum Frontier Hackathon](https://colosseum.org/) in the
[Superteam Indonesia track.](https://superteam.fun/earn/listing/indonesia-national-campus-hackathon)
