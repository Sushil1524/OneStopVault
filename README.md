# OneStop Vault - Zero-Knowledge Credential Manager & Cold Wallet 

A high-security zero-knowledge Credential Manager Vault with an air-gapped cold wallet generator with a **React + Vite frontend (Vercel deployment)** and a **Cloudflare Workers API + D1 SQLite backend**, protected by browser Web Crypto API (PBKDF2 600,000 iterations, AES-256-GCM), server-side pepper HMAC, and dual-layer checksum synchronization.

---

## Architecture Highlights

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (Vercel Host)                    │
│                                                             │
│  User Master Password + Salt                                │
│         │ (Web Crypto PBKDF2 600,000 rounds SHA-256)        │
│         ▼                                                   │
│  ┌────────────────────┐   ┌──────────────────────────────┐  │
│  │ Vault Key (AES-GCM)│   │ Auth Key Hash (to Worker)    │  │
│  └─────────┬──────────┘   └──────────────┬───────────────┘  │
│            │                             │                  │
│            ▼                             │                  │
│  Encrypted Ciphertext + IV               │                  │
│  + SHA-256 Vault Checksum                │                  │
└────────────┬─────────────────────────────┼──────────────────┘
             │                             │
             └──────────────┬──────────────┘
                            ▼ HTTPS
┌─────────────────────────────────────────────────────────────┐
│             CLOUDFLARE WORKERS (Backend Worker API)         │
│                                                             │
│  - Session Token Verification                               │
│  - Server Pepper HMAC Layer (Server-side secret envelope)   │
│  - Checksum Verification Engine                             │
│         │                                                   │
│         ▼                                                   │
│  Cloudflare D1 (SQLite Serverless DB)                       │
│  Tables: `users`, `vault_items`, `vault_metadata`           │
└─────────────────────────────────────────────────────────────┘
```

---

## Features

1. **Zero-Knowledge Encryption**: Master Password never touches the network or server. Key derivation happens inside browser memory via Web Crypto API.
2. **Cloudflare Workers Backend**: Fast, global serverless API built on Cloudflare Workers and Cloudflare D1 SQLite database.
3. **Standalone Password & Passphrase Generator**: Generate cryptographically random passwords or 4-word memorable passphrases 100% locally in your browser with zero network requests—accessible anytime with or without logging in.
4. **Dual-Layer Checksum Synchronization**: Client calculates SHA-256 vault checksums locally and reconciles against D1 database checksums automatically.
5. **Server Pepper Defense-in-Depth**: Encrypted payloads receive an additional HMAC envelope with a secret `SERVER_PEPPER` before being written to D1.
6. **Built-in TOTP Authenticator**: Generates live 6-digit 2FA codes with 30s countdown rings directly in the vault cards.
7. **k-Anonymity Leak Auditor**: Audits saved passwords anonymously against HaveIBeenPwned API (sending only 5-char SHA-1 prefix).
8. **Emergency Recovery Key Download**: Generates downloadable `.txt` recovery key upon registration.
9. 

---

## Project Layout

- `frontend/`: React 18 + Vite + TypeScript web application designed for Vercel.
- `backend/`: Cloudflare Worker API with Hono framework, D1 SQLite database bindings, and Wrangler config.

---

## Local Development Setup

### 1. Install Dependencies

```bash
# Root
npm install

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Run Backend (Cloudflare Worker + Local D1 DB)

```bash
cd backend
npm run d1:init  # Executes schema.sql on local D1 SQLite emulation
npm run dev      # Starts local Worker at http://localhost:8787
```

### 3. Run Frontend (Vite Dev Server)

```bash
cd frontend
npm run dev      # Starts local React app at http://localhost:3000
```

---

## Cloudflare Worker & D1 Setup Guide

### 1. How Multi-File Worker Uploads Work

You **do not need to manually drag-and-drop or select a single file**. 
The main entrypoint defined in `wrangler.jsonc` is `src/index.ts`. 

When you run `npx wrangler deploy` inside `backend/`, Wrangler automatically bundles all modular TypeScript files (`src/routes/*`, `src/crypto/*`, `src/db/*`) into a single execution bundle for Cloudflare's serverless runtime.

---

### 2. Step-by-Step Cloudflare D1 DB & Worker Setup

Open terminal and change directory to `backend/`:
```bash
cd backend
```

#### Step 1: Authenticate Wrangler CLI
Log into your Cloudflare account via browser:
```bash
npx wrangler login
```

#### Step 2: Create Cloudflare D1 Database
Create a serverless SQLite database named `vault-db`:
```bash
npx wrangler d1 create vault-db
```
*Take note of the `database_id` generated in the terminal output.*

#### Step 3: Configure `wrangler.jsonc`
Open `backend/wrangler.jsonc` and insert your assigned `database_id`:
```jsonc
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "vault-db",
      "database_id": "YOUR_ACTUAL_DATABASE_ID_HERE"
    }
  ]
```

#### Step 4: Run SQL Schema Migrations
Execute `schema.sql` to initialize SQL tables (`users`, `vault_items`, `vault_metadata`):

* **For local development testing**:
  ```bash
  npx wrangler d1 execute vault-db --local --file=schema.sql
  ```

* **For production Cloudflare D1**:
  ```bash
  npx wrangler d1 execute vault-db --remote --file=schema.sql
  ```

#### Step 5: Set Server Pepper Secret
Set your server-side pepper secret environment variable in Cloudflare:
```bash
npx wrangler secret put SERVER_PEPPER
```

#### Step 6: Deploy to Cloudflare Workers
Deploy the backend API:
```bash
npx wrangler deploy
```

---

## Deploying Frontend to Vercel

1. Import the `frontend/` directory into your Vercel Dashboard or run via Vercel CLI:
   ```bash
   cd frontend
   npx vercel
   ```
2. Set Environment Variable in Vercel project settings:
   - `VITE_WORKER_API_URL`: `https://onestop-vault-worker.<your-subdomain>.workers.dev`
