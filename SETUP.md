# KeyZero — Setup Rápido (Hackathon)

## Pré-requisitos
- Node.js 18+
- MySQL 8+ a correr localmente

## 1. Base de Dados
```bash
mysql -u root -p < database/schema.sql
```

## 2. Backend
```bash
cd backend
cp .env.example .env          # edita DB_PASS e JWT_SECRET
npm install
npm run dev                   # http://localhost:3001
```

## 3. Frontend
```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

## Variáveis de ambiente (.env)
```
DB_HOST=localhost
DB_USER=root
DB_PASS=<a tua password MySQL>
DB_NAME=keyzero
JWT_SECRET=<gera com: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
```

## Arquitetura Zero-Knowledge
```
Browser                         Servidor
───────                         ────────
masterKey (só em memória)
    │
    ├─ PBKDF2(:enc, salt) ──►  encKey  (AES-GCM, nunca enviada)
    │
    └─ PBKDF2(:auth, salt) ──► authToken ──► bcrypt(authToken) ──► guardado na BD
                                             JWT ◄──────────────────────────────
```
O servidor nunca vê a MasterKey nem o encKey.
