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

### Implemented

- Browser QRIS scanning with camera support.
- Demo QRIS flow.
- EMVCo TLV QRIS parsing.
- Static QRIS manual IDR amount fallback when Tag 54 is missing.
- Strict QRIS/manual amount validation.
- Phantom desktop wallet flow.
- Phantom mobile deeplink/session recovery flow.
- Solana devnet transfer flow.
- Live SOL/IDR quote endpoint using Pyth Hermes plus fallback FX source.
- Backend quote signing.
- Server-side Solana devnet transaction verification.
- Payment proof UI.
- Demo merchant payout record UI.
- Unit tests for QRIS amount parsing, TLV extraction, and quote amount resolution.
- Vercel serverless API structure.
- Supabase server-only helper modules for transaction persistence.

### Demo-only / simulated

- Demo QRIS is synthetic (QRIS itself has no devnet).
- Merchant rupiah settlement is simulated — no real IDR is disbursed.
- No real Indodax/Tokocrypto trading, Midtrans/Xendit/DOKU payout, bank API, or Solana mainnet flow is executed.

### In progress / planned

- Full persisted payment lifecycle from quote to verification to settlement record.
- Real fiat payout integration after gateway onboarding.
- More automated tests.
- Production demo screenshots/video.

## How It Works

1. **Scan** - The user scans a QRIS code through the web app.
2. **Parse** - The app reads the EMVCo TLV payload and extracts merchant and amount data.
3. **Quote** - The backend validates the QRIS payload and derives SOL/IDR from Pyth price feeds.
4. **Review** - The user reviews the merchant, IDR amount, and quoted SOL amount.
5. **Pay** - The user pays with Phantom on Solana devnet. The backend verifies the transaction against the signed quote, treasury wallet, and expected lamports.
6. **Receipt** - The app shows a payment proof and a demo merchant payout record. Real rupiah settlement is an intended production path requiring licensed gateway onboarding.

## Tech Stack

| Layer        | Tools                                             |
| ------------ | ------------------------------------------------- |
| Frontend     | Vite, React, Tailwind CSS                         |
| QR scanning  | `html5-qrcode`                                    |
| Web3         | `@solana/web3.js`, Solana Wallet Adapter, Phantom |
| Pricing      | Pyth Network Hermes, USD/IDR fallback API         |
| Backend      | Vercel Serverless Functions                       |
| Database     | Supabase Postgres                                 |
| Fiat gateway | Planned — Midtrans, Xendit, DOKU, or equivalent (requires business onboarding) |

## Project Structure

```text
api/
  lib/
    settlement/
      mockOfframp.js      Demo-only SOL_DEVNET to IDR_SIMULATED adapter
      mockPayout.js       Demo-only merchant bank payout adapter
    supabaseAdmin.js      Server-only Supabase client
    transactions.js       Transaction database helpers
    paymentQuotes.js      Quote generation and HMAC signing
  v1/
    payment/
      quote.js            POST /api/v1/payment/quote
      quote.test.js       Unit tests for quote amount parsing
      verify.js           POST /api/v1/payment/verify
      settle-demo.js      POST /api/v1/payment/settle-demo

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

## Hackathon Demo Notes

- QRIS itself has no devnet.
- Demo QRIS is a synthetic EMVCo QRIS payload used to simulate merchant QR data.
- The Solana payment is real on devnet.
- The backend verifies the submitted Solana transaction against the signed quote, treasury wallet, and expected lamports.
- The merchant rupiah payout is represented as a demo settlement record.
- Real QRIS payout through Midtrans, Xendit, DOKU, or similar providers requires merchant onboarding, KYC, and eligible business/legal-entity access.

## Settlement model

KonekPay currently performs real Solana devnet payment verification. The SOL-to-IDR conversion and merchant bank payout are simulated through provider-style adapters, because real production settlement requires a licensed crypto off-ramp and payment gateway. In production, MockOfframp becomes Indodax/Tokocrypto/etc., and MockPayout becomes Xendit/DOKU/Midtrans/etc.

- Demo: real Solana devnet payment verification plus simulated SOL-to-IDR conversion and simulated merchant bank payout.
- Production: replace `MockOfframpProvider` with a licensed crypto off-ramp/exchange partner such as Indodax, Tokocrypto, or an equivalent regulated provider.
- Production: replace `MockPayoutProvider` with a licensed payout/payment gateway partner such as Xendit, DOKU, Midtrans, or a bank partner.
- KonekPay does not bypass QRIS/payment regulation.

## Golden Demo Flow

1. Open the deployed app.
2. Connect Phantom on Solana devnet.
3. Use Demo QRIS.
4. Confirm the SOL/IDR quote.
5. Pay with Phantom.
6. Backend verifies the devnet transaction.
7. App shows Payment Proof.
8. App shows simulated SOL-to-IDR and merchant bank payout records.
9. Open the Solana Explorer receipt.

## API

### `POST /api/v1/payment/quote`

Creates a short-lived SOL quote from a QRIS payload.

**Request with dynamic QRIS (Tag 54 present):**

```json
{
  "qrisPayload": "000201..."
}
```

**Request with static QRIS (Tag 54 missing):**

```json
{
  "qrisPayload": "000201...",
  "idrAmount": "15000"
}
```

**Rules:**

- `qrisPayload` is required.
- If QRIS Tag 54 exists, the Tag 54 amount wins; `idrAmount` is ignored.
- `idrAmount` is only used when Tag 54 is missing.
- Manual amount must be a strict whole IDR integer string.
- Reject examples: `Rp 25.000`, `25,000`, `1e5`, `0`, `-1`, `15000abc`, `15000.50`.
- The endpoint does not trust arbitrary client-provided fiat amounts for dynamic QRIS.
- The endpoint returns a short-lived signed quote.

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

### `POST /api/v1/payment/settle-demo`

Simulates fiat settlement for hackathon demo purposes. Does **not** call real
Indodax, Tokocrypto, Midtrans, Xendit, DOKU, or bank APIs. No real IDR is
disbursed.

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
  "status": "SETTLED_SIMULATED",
  "settlementReference": "DEMO-SETTLEMENT-A1B2C3D4",
  "quoteId": "demo_quote_v1....",
  "signature": "5zy...",
  "onchain": {
    "network": "solana-devnet",
    "status": "PAID_VERIFIED",
    "asset": "SOL_DEVNET",
    "amount": "0.012345678"
  },
  "offramp": {
    "provider": "MOCK_OFFRAMP",
    "status": "IDR_FLOAT_CREDITED",
    "fromAsset": "SOL_DEVNET",
    "toAsset": "IDR_SIMULATED"
  },
  "payout": {
    "provider": "MOCK_PAYOUT",
    "status": "PAYOUT_SIMULATED_SUCCESS",
    "destination": {
      "bankCode": "BCA",
      "bankName": "Bank Central Asia",
      "accountNumberMasked": "****1234"
    }
  },
  "disclaimer": "No real IDR was disbursed. This simulates the licensed settlement rail for hackathon review."
}
```

Common failures:

| Error | Meaning |
| ----- | ------- |
| `MISSING_FIELDS` | `quoteId` or `signature` was not provided. |
| `INVALID_SIGNATURE` | The signature is not a valid Solana transaction signature. |
| `SETTLEMENT_NOT_AVAILABLE` | The quote was not found or is invalid. |

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
| `VITE_TREASURY_WALLET`          | Frontend payment flow                    | Solana transfer destination       | Public     |
| `VITE_PUBLIC_SUPABASE_URL`      | Serverless API and future frontend reads | Supabase project URL              | Public     |
| `VITE_PUBLIC_SUPABASE_ANON_KEY` | Future frontend Supabase reads           | Browser-safe Supabase access      | Public     |
| `SUPABASE_SERVICE_ROLE_KEY`     | Serverless API only                      | Transaction admin operations      | Secret     |
| `SOLANA_RPC_URL`                | Serverless payment verification          | Backend Solana devnet reads       | Secret     |
| `TREASURY_WALLET`               | Serverless payment verification          | Expected payment destination      | Secret     |
| `PAYMENT_QUOTE_SECRET`          | Serverless quote signing                 | Quote integrity checks            | Secret     |
| `MIDTRANS_SERVER_KEY`           | Future licensed gateway integration      | Planned fiat payout (not active)  | Secret     |

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
8. Confirm the simulated off-ramp and merchant bank payout sections appear.

### Demo settlement

> **Important:** The Solana payment verification in this prototype is **real**
> on devnet. The settlement step is **simulated** for the hackathon demo. No
> real IDR is disbursed. Real fiat payout through a licensed gateway is on the
> roadmap.

Demo flow:

```text
Demo QRIS → Pyth quote → Phantom devnet transfer → backend verification → simulated off-ramp → simulated merchant bank payout → Explorer receipt
```

## Scripts

```bash
npm run dev            # Start the Vite development server
npm run build          # Build the production frontend bundle
npm run preview        # Preview the production build locally
npm run lint           # Run ESLint
npm test               # Run Node tests for payment quote parsing/amount resolution
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

### Vercel deployment environment variables

Local `.env.local` is not automatically used by Vercel production. Add payment
environment variables in:

```text
Vercel Dashboard -> Project -> Settings -> Environment Variables
```

Add these for Production, Preview, and Development:

```text
VITE_SOLANA_RPC_URL
SOLANA_RPC_URL
VITE_TREASURY_WALLET
TREASURY_WALLET
PAYMENT_QUOTE_SECRET
```

After changing any `VITE_*` variable, redeploy the Vercel project. Vite bakes
`VITE_*` values into the frontend bundle during build, so changing the dashboard
value alone does not update an already deployed site.

If `VITE_TREASURY_WALLET` is missing in the deployed frontend, payment setup
fails before Phantom opens with:

```text
Frontend VITE_TREASURY_WALLET is missing. Configure it in Vercel Environment Variables and redeploy.
```

If backend `TREASURY_WALLET` is missing, the verify endpoint returns a backend
treasury wallet configuration error.

### Mobile deployed test checklist

1. Open the deployed site on a phone.
2. Connect Phantom on Solana devnet.
3. Use Demo QRIS.
4. Confirm the quote.
5. Pay with Phantom.
6. Verify payment.
7. View demo merchant payout record.
8. Open Explorer.

## QRIS Parser

The QRIS parser lives in `src/utils/parseEmvcoQris.js`. It reads EMVCo TLV tags
and exposes the fields used by the payment review flow, including:

- Tag `54` - transaction amount
- Tag `59` - merchant name
- Tag `53` - currency code

The backend quote endpoint has its own validation path so pricing cannot be
manipulated by client-side state.

### QRIS test payloads

QRIS does not have a devnet or sandbox. Standard Indonesian payment gateways
(Midtrans, Xendit, DOKU) require registered legal business entities to access
QRIS APIs, even in sandbox mode. KonekPay uses the QRIS payload for
merchant/amount parsing, then verifies the Solana devnet payment separately.

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
- No IDR settlement occurs. The merchant payout record is a demo simulation.
- The "KANTIN 165 DEMO" merchant name is synthetic.

You can also paste any valid EMVCo QRIS payload into the manual textarea in the
scanner modal. The parser will validate it and show errors if the payload is
malformed.

## Roadmap

### Demo readiness

- [x] QRIS scanner and Demo QRIS flow
- [x] Phantom desktop and mobile flow
- [x] Live SOL/IDR quote endpoint
- [x] Backend Solana devnet verification
- [x] Demo merchant payout record
- [x] Strict QRIS/manual amount validation
- [x] Unit tests for quote amount parsing
- [ ] Add production demo link, screenshots, or short walkthrough video

### Post-hackathon prototype

- [ ] Persist full payment lifecycle states in Supabase
- [ ] Add settlement/reconciliation records
- [ ] Add more endpoint tests for quote, verify, and settle-demo
- [ ] Add E2E test for Demo QRIS to verified payment flow
- [ ] Improve merchant-facing payout dashboard/state history

### Production path

- [ ] Complete business/legal onboarding for a QRIS-capable payment gateway
- [ ] Replace demo settlement with real Midtrans, Xendit, DOKU, or equivalent payout execution
- [ ] Add settlement reconciliation and failure handling
- [ ] Add compliance, security review, and key-management hardening
- [ ] Decide mainnet treasury/custody model
- [ ] Add fee model and exchange-rate risk handling

## Acknowledgements

Built for the [Colosseum Frontier Hackathon](https://colosseum.org/) in the
[Superteam Indonesia track.](https://superteam.fun/earn/listing/indonesia-national-campus-hackathon)
