# Relatório KeyZero — Hackathon Shift to Digital

## Estado Atual do Projeto

### Infraestrutura
| Componente | Estado | URL/Porta |
|---|---|---|
| MySQL 8 (Docker) | ✅ Running + Healthy | `localhost:3306` |
| Backend Express | ✅ Running | `http://localhost:3001` |
| Frontend Vite/React | ✅ Running | `http://localhost:5173` |

---

## ✅ O que está feito e a funcionar

### Base de Dados (`database/schema.sql`)
- Tabela `users` — `id (UUID)`, `email (UNIQUE)`, `salt (CHAR 64)`, `auth_hash (VARCHAR 255)`, `created_at`
- Tabela `passwords` — `id (UUID)`, `user_id (FK → users)`, `site`, `username`, `encrypted_password (TEXT)`, `created_at`, `updated_at`
- Foreign key com `ON DELETE CASCADE` (apagar utilizador apaga as suas passwords)

### Backend (`backend/`)

#### Endpoints de Autenticação Zero-Knowledge
| Endpoint | Método | Corpo | Resposta |
|---|---|---|---|
| `/api/auth/register` | POST | `{ email }` | `{ userId, salt }` |
| `/api/auth/register/finalize` | POST | `{ userId, authToken }` | `{ token }` (JWT) |
| `/api/auth/login` | POST | `{ email }` | `{ userId, salt }` |
| `/api/auth/login/verify` | POST | `{ userId, authToken }` | `{ token }` (JWT) |
| `/api/health` | GET | — | `{ status: "ok" }` |

#### Endpoints CRUD de Passwords (protegidos por JWT)
| Endpoint | Método | Função |
|---|---|---|
| `/api/passwords` | GET | Lista todas as passwords do utilizador autenticado |
| `/api/passwords` | POST | Cria nova entrada cifrada |
| `/api/passwords/:id` | PUT | Actualiza site, username e/ou password cifrada |
| `/api/passwords/:id` | DELETE | Remove uma entrada |

> Todos os endpoints de passwords filtram por `user_id` do JWT — isolamento total entre utilizadores.

### Módulos Backend (após resolução de incompatibilidades)
| Pacote | Função |
|---|---|
| `express` | Servidor HTTP + routing |
| `cors` | Permite pedidos do frontend (localhost:5173) |
| `bcryptjs` | Hash do authToken (puro JS, sem código nativo) |
| `jose` | JWT assíncrono com HS256 (compatível com Node 23) |
| `mariadb` | Connector MySQL (puro JS, sem addons nativos) |
| `uuid` | Geração de IDs UUID v4 |
| `dotenv` | Variáveis de ambiente |

### Frontend (`frontend/src/`)
| Ficheiro | Função |
|---|---|
| `utils/crypto.js` | PBKDF2 · AES-GCM · CSPRNG · Validação MasterKey |
| `context/AuthContext.jsx` | JWT + encKey em memória (zero persistência em disco) |
| `lib/api.js` | Cliente HTTP com Bearer token automático |
| `pages/RegisterPage.jsx` | Formulário com 6 regras de segurança validadas em tempo real |
| `pages/LoginPage.jsx` | Login ZK em 2 passos |
| `pages/Dashboard.jsx` | CRUD completo · reveal/hide · copy · gerador de passwords |
| `App.jsx` | Roteamento condicional (auth vs dashboard) |

### Funcionalidades implementadas no Dashboard
- Listar passwords do cofre com pesquisa em tempo real
- Adicionar nova password (com gerador criptográfico)
- Editar password existente
- Apagar com confirmação
- Mostrar/esconder password (toggle)
- Copiar password para clipboard
- Badge visual de segurança (AES-GCM 256-bit · PBKDF2 · Zero-Knowledge)
- Animação de skeleton loading
- Toast de notificação para feedback de ações
- Design responsivo (mobile + desktop)

### Segurança implementada no `crypto.js`
- **PBKDF2-SHA256** com 310 000 iterações (mínimo OWASP 2024)
- **AES-GCM 256-bit** para cifra/decifra de passwords
- **IV aleatório** de 96-bit por cada encriptação (nunca reutilizado)
- **Separação de chaves**: `encKey` (cifra) e `authToken` (autenticação) derivados com prefixos diferentes — comprometer um não compromete o outro
- **CryptoKey não-exportável**: a chave AES-GCM fica apenas em memória e não pode ser extraída
- **Gerador CSPRNG**: usa `window.crypto.getRandomValues` (não `Math.random`)
- **Validação MasterKey**: 6 regras (min 12 chars, não começa por maiúscula, não termina em número, mistura maiúsculas/minúsculas/números/símbolos)

---

## ⚠️ Problemas encontrados e resolvidos

Durante a configuração foram identificados e corrigidos **5 problemas de compatibilidade** com Node.js 23 + macOS ARM (Apple Silicon):

| # | Problema | Causa Raiz | Solução Aplicada |
|---|---|---|---|
| 1 | `bcrypt` travava ao fazer `require()` | Addon nativo C++ incompatível com Node 23 | Substituído por `bcryptjs` (JavaScript puro) |
| 2 | `jsonwebtoken` travava ao fazer `require()` | Incompatibilidade com Node 23 | Substituído por `jose` (API assíncrona moderna) |
| 3 | `mysql2` travava ao fazer `require()` | Tentativa de carregar addon `iconv` nativo | Substituído por `mariadb` connector (JavaScript puro) |
| 4 | `mariadb` não conseguia autenticar | MySQL 8 usa `caching_sha2_password` por defeito | `ALTER USER ... IDENTIFIED WITH mysql_native_password` |
| 5 | Backend não ouvia na porta 3001 | `dotenv` carregava do diretório errado | Script `start-backend.sh` com `cd` explícito para `/backend` |

---

## 🔐 Arquitectura Zero-Knowledge (para apresentar aos juízes)

```
BROWSER                                    SERVIDOR
──────────────────────────────────────     ──────────────────────────────────────
masterKey (só em RAM, nunca sai)
  │
  ├─ PBKDF2(masterKey + ":enc",  salt)  →  encKey  [AES-GCM 256-bit]
  │    └── cifra passwords antes de           └── NUNCA enviado ao servidor
  │        enviar ao servidor                 └── inútil sem a masterKey
  │
  └─ PBKDF2(masterKey + ":auth", salt)  →  authToken (hex, 256-bit)
       └── enviado ao servidor                 └── bcryptjs(authToken) na BD
           UMA VEZ por login                   └── JWT devolvido se válido
```

**Garantia de segurança**: mesmo que a base de dados seja completamente comprometida:
- O atacante obtém `bcryptjs(PBKDF2(masterKey+":auth", salt))` — precisa de 310 000 iterações de PBKDF2 *por cada tentativa* de masterKey → ataque de força bruta extremamente lento
- O `encKey` **nunca chegou ao servidor** → os blobs cifrados `encrypted_password` são inúteis sem a masterKey original
- O servidor tem **zero-knowledge** das passwords reais dos utilizadores

---

## 🚀 Como arrancar o projeto

### Pré-requisitos
- Docker Desktop (instalado e aberto)
- Node.js 18+

### Comandos

```bash
# 1. Levantar a base de dados MySQL 8
cd /Users/henriquelaia/Desktop/KeyZero
docker compose up -d

# 2. Backend (abre um terminal)
./start-backend.sh
# → http://localhost:3001

# 3. Frontend (abre outro terminal)
./start-frontend.sh
# → http://localhost:5173
```

### Variáveis de ambiente (`backend/.env`)
```
PORT=3001
FRONTEND_URL=http://localhost:5173
DB_HOST=localhost
DB_PORT=3306
DB_USER=keyzero_user
DB_PASS=keyzero_pass
DB_NAME=keyzero
JWT_SECRET=<gerado automaticamente>
JWT_EXPIRES_IN=7d
```

---

## 📁 Estrutura de ficheiros

```
KeyZero/
├── docker-compose.yml           ← MySQL 8 containerizado
├── start-backend.sh             ← Script de arranque do backend
├── start-frontend.sh            ← Script de arranque do frontend
├── SETUP.md                     ← Guia de setup rápido
├── RELATORIO.md                 ← Este ficheiro
│
├── database/
│   └── schema.sql               ← Tabelas users e passwords
│
├── backend/
│   ├── server.js                ← Express + CORS + rotas
│   ├── db.js                    ← Pool mariadb com compatibilidade MySQL 8
│   ├── package.json             ← bcryptjs, jose, mariadb, express, uuid, dotenv
│   ├── .env                     ← Variáveis de ambiente (JWT_SECRET gerado)
│   ├── middleware/
│   │   └── auth.js              ← Verificação JWT com jose
│   └── routes/
│       ├── auth.js              ← Registo e Login ZK (2 passos cada)
│       └── passwords.js         ← CRUD com isolamento por user_id
│
└── frontend/
    ├── index.html
    ├── vite.config.js           ← Proxy /api → localhost:3001
    ├── tailwind.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx              ← Roteamento auth ↔ dashboard
        ├── index.css            ← Tailwind + classes reutilizáveis
        ├── lib/
        │   └── api.js           ← Cliente HTTP com Bearer token
        ├── utils/
        │   └── crypto.js        ← PBKDF2 · AES-GCM · CSPRNG · Validação
        ├── context/
        │   └── AuthContext.jsx  ← Estado global em memória (sem localStorage)
        └── pages/
            ├── RegisterPage.jsx ← Form com validação de MasterKey em tempo real
            ├── LoginPage.jsx    ← Login ZK em 2 passos
            └── Dashboard.jsx    ← Cofre CRUD completo + gerador de passwords
```

---

## 📋 Checklist para a demonstração

- [x] Base de dados criada e a funcionar (Docker)
- [x] Backend com todos os endpoints a responder
- [x] Autenticação Zero-Knowledge implementada
- [x] CRUD de passwords com cifra AES-GCM
- [x] Frontend com dashboard responsivo
- [x] Validação de MasterKey com 6 regras
- [x] Gerador de passwords criptograficamente seguro
- [ ] Testar fluxo completo no browser (registo → login → CRUD)
- [ ] Verificar responsividade mobile
- [ ] Preparar discurso para os juízes sobre ZK

---

*Gerado em 2026-03-04 — KeyZero para o Hackathon "Shift to Digital"*
