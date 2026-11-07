# KeyZero — One MasterKey. Zero Knowledge.

Zero-knowledge password manager built for the **Shift to Digital** hackathon. Encryption happens in the browser; the server stores ciphertext and a bcrypt hash of an authentication token — never the MasterKey.

> Portuguese technical deep-dive: [DOCS.md](./DOCS.md).

## Team

Built as a team for the Shift to Digital hackathon by:

- [@henriquelaia](https://github.com/henriquelaia)
- [@Brunocor26](https://github.com/Brunocor26)

Individual contribution split is not claimed here beyond shared authorship of this public tree. License / ownership between authors is **not** decided in this repository yet — do not assume MIT or any other SPDX license.

## Security model (honest limits)

- Client derives `encKey` (`MasterKey + ':enc'`) and `authToken` (`MasterKey + ':auth'`) with PBKDF2-SHA256 (310 000 iterations).
- Passwords are encrypted with AES-GCM in the browser before upload.
- The server stores `bcrypt(authToken)` and opaque ciphertext blobs.
- This is a **hackathon prototype**, not a formal security audit, threat-model review, or production password manager.
- Statements such as “the server can never read vaults” assume the published client crypto is used as designed, the MasterKey stays off the server, and the deployment is not compromised in ways outside that model (XSS, malicious client builds, etc.).

## Features

- Zero-knowledge style vault (browser-side AES-GCM)
- WebAuthn passkeys (PRF) and key-file login helpers
- Vault CRUD over JWT-authenticated API
- CSPRNG password generator
- Optional Google Safe Browsing URL checks + local typosquatting heuristics

## Local setup

Requirements: Node.js 22+ (needed for backend `jose@6` under CommonJS), MongoDB (local or Atlas).

### Backend

```bash
cd backend
cp .env.example .env   # set MONGODB_URI and a strong JWT_SECRET
npm ci
npm run dev            # http://localhost:3001
```

### Frontend

```bash
cd frontend
npm ci
npm run dev            # http://localhost:5173
```

Do **not** commit `node_modules/` or real `.env` files. Lockfiles (`package-lock.json`) are the source of truth for installs.

### Tests

```bash
cd backend && npm test
cd frontend && npm test
```

Backend tests use an in-memory DB mock (no production MongoDB). Frontend tests exercise `src/utils/crypto.js` with Node’s Web Crypto API.

## Environment (`backend/.env`)

| Variable | Purpose |
|----------|---------|
| `PORT` | API port (default `3001`) |
| `FRONTEND_URL` | CORS + WebAuthn origin |
| `RP_ID` | WebAuthn relying party id |
| `MONGODB_URI` | MongoDB connection string |
| `DB_NAME` | Database name |
| `JWT_SECRET` | HS256 secret (≥ 32 random chars) |
| `JWT_EXPIRES_IN` | JWT lifetime (e.g. `7d`) |
| `GOOGLE_SAFE_BROWSING_KEY` | Optional Safe Browsing API key |

## Project layout

```
KeyZero/
├── backend/          # Express API + MongoDB
├── frontend/         # React + Vite client (Web Crypto)
├── DOCS.md           # Detailed Portuguese technical notes
└── README.md
```

## Out of scope here

- Choosing or adding a `LICENSE` file (needs agreement between authors)
- Rewriting git history or rotating credentials that may exist only in older commits
- Claiming production readiness or third-party audit results
