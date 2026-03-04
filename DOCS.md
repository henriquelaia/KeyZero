# KeyZero — Documentação Técnica Completa

---

## 1. Visão Geral da Arquitetura

O KeyZero é uma aplicação web full-stack com uma separação clara entre frontend (React/Vite) e backend (Node.js/Express), ligados a uma base de dados MongoDB.

O princípio central é **Zero-Knowledge**: o servidor nunca tem acesso à MasterKey nem à chave de encriptação. Toda a criptografia é executada exclusivamente no browser do utilizador. O servidor apenas armazena e devolve blobs cifrados que não consegue decifrar.

```
Browser (React)                    Servidor (Node.js)          Base de Dados (MongoDB)
──────────────────                 ──────────────────          ───────────────────────
MasterKey (memória)
    │
    ├─ PBKDF2 → encKey ──────────── nunca sai ──────────────────────────────────────
    │
    └─ PBKDF2 → authToken ──────── POST /api/auth/login/verify ──► bcrypt hash ───► users
                                                                                   passwords (blobs)
                                                                                   passkey_credentials
```

---

## 2. Modelo de Segurança Zero-Knowledge

### Derivação de chaves

A partir de uma única MasterKey (ou do output PRF de uma Passkey), são derivadas **duas chaves independentes**:

```
MasterKey + ':enc'  + salt  → PBKDF2-SHA256 (310 000 iter) → encKey   (AES-GCM, não-exportável)
MasterKey + ':auth' + salt  → PBKDF2-SHA256 (310 000 iter) → authToken (256-bit hex)
```

- **`encKey`**: usada para cifrar e decifrar passwords no browser. Nunca sai do browser.
- **`authToken`**: enviado ao servidor no login. O servidor armazena `bcrypt(authToken, rounds=12)`.

### Propriedades de segurança

| Propriedade | Detalhe |
|-------------|---------|
| Separação de chaves | Comprometer `authToken` não revela `encKey`, e vice-versa |
| Custo de brute-force | 310 000 iterações PBKDF2 + 12 rounds bcrypt por tentativa |
| Nonce único | IV de 96 bits gerado com CSPRNG para cada operação AES-GCM |
| Sem persistência | `encKey` nunca escrito em localStorage, sessionStorage nem cookies |
| IDOR Prevention | Todas as queries de BD filtram por `user_id` extraído do JWT |
| Timing oracle | Login introduz delay de 200ms em respostas de "email não encontrado" |

---

## 3. Fluxos de Autenticação

### 3.1 Registo Clássico (2 passos)

```
Cliente                              Servidor
──────                               ────────
POST /api/auth/register { email }
                              ←── { userId, salt }   (salt = 32 bytes aleatórios)

[deriva encKey e authToken localmente com PBKDF2]

POST /api/auth/register/finalize { userId, authToken }
                              ←── { token }          (JWT assinado HS256)
```

O servidor armazena `bcrypt(authToken)` — nunca a MasterKey.

### 3.2 Login Clássico (2 passos)

```
Cliente                              Servidor
──────                               ────────
POST /api/auth/login { email }
                              ←── { userId, salt }

[deriva encKey e authToken localmente]

POST /api/auth/login/verify { userId, authToken }
                              ←── { token }
```

### 3.3 Registo de Passkey (WebAuthn PRF)

Requer que o utilizador já esteja autenticado (sessão clássica ativa).

```
Cliente                                      Servidor
──────                                       ────────
POST /api/auth/passkeys/register/options { userId }
                              ←── WebAuthn PublicKeyCredentialCreationOptions
                                  (inclui PRF extension seed + challenge)

[browser invoca autenticador biométrico]
[autenticador gera keypair + PRF output]

POST /api/auth/passkeys/register/verify { userId, response }
                              ←── { verified: true }
                                  (credencial guardada em passkey_credentials)
```

### 3.4 Login com Passkey

```
Cliente                                      Servidor
──────                                       ────────
POST /api/auth/passkeys/login/options { email }
                              ←── { options, salt, userId }

[browser invoca autenticador]
[PRF extension devolve output determinístico → substitui MasterKey]

POST /api/auth/passkeys/login/verify { email, response }
                              ←── { verified: true, token, userId }

[cliente deriva encKey a partir do PRF output + salt]
```

O PRF output é determinístico para o mesmo autenticador e o mesmo `rpID` — funciona como uma "MasterKey invisível" gerada pela biometria.

### 3.5 Login com Ficheiro de Chave

O utilizador gera um ficheiro com uma chave aleatória de 256 bits no registo (guardado localmente). No login, abre o ficheiro — o conteúdo substitui a MasterKey no fluxo clássico.

---

## 4. Criptografia

### PBKDF2

- **Algoritmo**: PBKDF2-SHA256
- **Iterações**: 310 000 (mínimo OWASP 2024)
- **Output**: 256 bits
- **API**: `crypto.subtle.deriveKey` / `crypto.subtle.deriveBits` (Web Crypto API)

### AES-GCM

- **Tamanho da chave**: 256 bits
- **IV**: 96 bits, gerado com `crypto.getRandomValues` por cada cifra
- **Formato armazenado**: JSON `{ ct: "<base64>", iv: "<base64>" }`
- **Não-exportável**: a `CryptoKey` é criada com `extractable: false`

### CSPRNG (Gerador de Passwords)

- Usa `window.crypto.getRandomValues` (Uint8Array)
- Charset de 85 caracteres (letras, números, símbolos)
- Garante pelo menos 1 maiúscula, 1 número, 1 símbolo por password gerada

### Validação da MasterKey

Regras obrigatórias:
- Mínimo 12 caracteres
- Não pode começar por letra maiúscula
- Não pode terminar em número
- Deve conter: maiúscula, minúscula, número, símbolo

---

## 5. API Reference

Todas as rotas autenticadas exigem header `Authorization: Bearer <jwt>`.

### Autenticação Clássica

| Método | Rota | Body | Resposta |
|--------|------|------|----------|
| `POST` | `/api/auth/register` | `{ email }` | `{ userId, salt }` |
| `POST` | `/api/auth/register/finalize` | `{ userId, authToken }` | `{ token }` |
| `POST` | `/api/auth/login` | `{ email }` | `{ userId, salt }` |
| `POST` | `/api/auth/login/verify` | `{ userId, authToken }` | `{ token }` |

### Passkeys (WebAuthn)

| Método | Rota | Auth | Body | Resposta |
|--------|------|------|------|----------|
| `POST` | `/api/auth/passkeys/register/options` | — | `{ userId }` | `PublicKeyCredentialCreationOptions` |
| `POST` | `/api/auth/passkeys/register/verify` | — | `{ userId, response }` | `{ verified: true }` |
| `POST` | `/api/auth/passkeys/login/options` | — | `{ email }` | `{ options, salt, userId }` |
| `POST` | `/api/auth/passkeys/login/verify` | — | `{ email, response }` | `{ verified, token, userId }` |

### Cofre de Passwords

| Método | Rota | Auth | Body | Resposta |
|--------|------|------|------|----------|
| `GET` | `/api/passwords` | JWT | — | `[{ id, site, username, encrypted_password, ... }]` |
| `POST` | `/api/passwords` | JWT | `{ site, username?, encrypted_password }` | `{ id, site, username, encrypted_password }` |
| `PUT` | `/api/passwords/:id` | JWT | `{ site, username?, encrypted_password }` | `{ success: true }` |
| `DELETE` | `/api/passwords/:id` | JWT | — | `{ success: true }` |

### Verificação de URL

| Método | Rota | Auth | Body | Resposta |
|--------|------|------|------|----------|
| `POST` | `/api/check-url` | JWT | `{ url }` | `{ safe: bool, threats: [], configured: bool }` |

### Health Check

| Método | Rota | Resposta |
|--------|------|----------|
| `GET` | `/api/health` | `{ status: "ok", project: "KeyZero" }` |

---

## 6. Schema da Base de Dados (MongoDB)

### `users`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string (UUID v4) | Identificador único do utilizador |
| `email` | string (único) | Email de registo |
| `salt` | string (hex, 64 chars) | Salt de 256 bits gerado no registo (único) |
| `auth_hash` | string | `bcrypt(authToken)` — `"pending"` durante o passo 1 do registo |
| `created_at` | Date | Data de criação |

Índices: `email` (unique), `salt` (unique).

### `passwords`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string (UUID v4) | Identificador único do registo |
| `user_id` | string | FK para `users.id` |
| `site` | string | Nome/domínio do site |
| `username` | string | Username (em claro — não é sensível) |
| `encrypted_password` | string (JSON) | `{ ct: "<base64>", iv: "<base64>" }` |
| `created_at` | Date | Data de criação |
| `updated_at` | Date | Data de última atualização |

### `passkey_credentials`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string (base64url) | Credential ID da passkey |
| `user_id` | string | FK para `users.id` |
| `public_key` | string (base64) | Chave pública COSE do autenticador |
| `counter` | number | Contador de uso (replay protection) |
| `transports` | string | Transportes suportados (CSV, e.g. `"internal,hybrid"`) |
| `created_at` | Date | Data de registo |
| `updated_at` | Date | Data de última atualização do contador |

### `auth_challenges`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `user_id` | string | FK para `users.id` (ou `"global_challenge_cache"`) |
| `challenge` | string | Challenge WebAuthn de uso único (consumido após verificação) |
| `created_at` | Date | Data de criação (para deteção de expiração) |

---

## 7. Estrutura de Ficheiros Detalhada

```
KeyZero/
├── backend/
│   ├── middleware/
│   │   └── auth.js              # Middleware JWT: valida Bearer token, injeta req.user
│   ├── routes/
│   │   ├── auth.js              # Registo e login ZK em 2 passos
│   │   ├── passkeys.js          # WebAuthn: register/options, register/verify, login/options, login/verify
│   │   ├── passwords.js         # CRUD: GET, POST, PUT /:id, DELETE /:id
│   │   └── urlcheck.js          # POST /api/check-url → Google Safe Browsing
│   ├── db.js                    # MongoClient singleton + queryFallback wrapper
│   ├── server.js                # Bootstrap: Express, CORS, rotas, error handler
│   ├── package.json
│   ├── .env.example
│   └── .env                     # (não versionado)
├── frontend/
│   ├── src/
│   │   ├── context/
│   │   │   └── AuthContext.jsx  # Contexto React: token, encKey, userId, login(), logout()
│   │   ├── lib/
│   │   │   └── api.js           # Funções: register, loginChallenge, loginVerify, getPasswords, ...
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx    # Login clássico + Passkey + Ficheiro de Chave
│   │   │   ├── RegisterPage.jsx # Registo clássico + Ficheiro de Chave
│   │   │   └── Dashboard.jsx    # Cofre CRUD + gerador + phishing detection + passkey button
│   │   └── utils/
│   │       ├── crypto.js        # deriveEncryptionKey, deriveAuthToken, encryptPassword, decryptPassword, generatePassword, validateMasterKey
│   │       ├── passkeys.js      # registerPasskey(), loginWithPasskey() — WebAuthn client
│   │       └── fileAuth.js      # generateAndSaveKeyFile(), readKeyFile()
│   ├── index.html
│   ├── vite.config.js           # Proxy /api → http://localhost:3001
│   ├── tailwind.config.js
│   └── package.json
├── DOCS.md
└── README.md
```

---

## 8. Componentes Frontend

### `AuthContext.jsx`

Estado global de autenticação mantido **exclusivamente em memória React** (sem localStorage). Expõe:
- `token` — JWT para chamadas à API
- `encKey` — CryptoKey AES-GCM (não-exportável)
- `userId`, `email`
- `login(token, encKey, userId, email)` — popula o contexto
- `logout()` — limpa tudo

### `Dashboard.jsx`

Componente principal do cofre. Sub-componentes internos:
- `Toast` — notificações temporárias (sucesso/erro)
- `Modal` — wrapper de dialog com overlay
- `PasswordForm` — formulário de criação/edição com gerador integrado
- `PasswordCard` — card individual com copy, show/hide, edit, delete
- `PhishingWarning` — banner de alerta com link para segurança

Lógica de phishing:
1. Ao guardar/editar um registo, o URL é normalizado e verificado localmente (typosquatting via Levenshtein)
2. Se passar, é enviado para `POST /api/check-url` (Google Safe Browsing)
3. Se for detetada ameaça, mostra banner persistente no card

### `LoginPage.jsx` / `RegisterPage.jsx`

Três modalidades de autenticação disponíveis:
- Formulário clássico (email + MasterKey)
- Botão "Passkey" (WebAuthn PRF)
- Botão "Ficheiro de Chave" (file picker)

---

## 9. Deteção de Phishing

### Google Safe Browsing API

- Rota backend: `POST /api/check-url`
- Verifica ameaças: `MALWARE`, `SOCIAL_ENGINEERING`, `UNWANTED_SOFTWARE`, `POTENTIALLY_HARMFUL_APPLICATION`
- Se a API Key não estiver configurada, retorna `{ safe: true, configured: false }` (não bloqueia funcionalidade)
- Erros de rede também resultam em `safe: true` (fail-open — não penaliza o utilizador por problemas de conectividade)

### Typosquatting Local (Levenshtein)

Implementado em `Dashboard.jsx`:
- Lista de 30 domínios populares (`POPULAR_DOMAINS`)
- Substituições de caracteres comuns (`0→o`, `1→l`, etc.) aplicadas antes da comparação
- Distância de Levenshtein ≤ 2 entre o domínio inserido e um domínio popular → aviso de typosquatting

Esta verificação é local (sem chamada de rede), instantânea e não depende de API Key.

---

## 10. Configuração de Ambiente

Ficheiro: `backend/.env` (baseado em `backend/.env.example`)

```env
PORT=3001
FRONTEND_URL=http://localhost:5173
RP_ID=localhost

# MongoDB
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/?retryWrites=true&w=majority&appName=KeyZero
DB_NAME=keyzero

# JWT
JWT_SECRET=<gera com: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
JWT_EXPIRES_IN=7d

# Google Safe Browsing (opcional)
GOOGLE_SAFE_BROWSING_KEY=<AIza...>
```

---

## 11. Como Correr em Produção (Notas)

- Definir `RP_ID` com o domínio real (e.g. `keyzero.app`) — obrigatório para WebAuthn funcionar
- Definir `FRONTEND_URL` com o URL de produção (HTTPS obrigatório para WebAuthn)
- Gerar um `JWT_SECRET` forte e único (mínimo 64 bytes aleatórios)
- Usar MongoDB Atlas ou servidor gerido com TLS ativo
- Servir o frontend via CDN ou servidor estático; o Vite proxy só existe em desenvolvimento
- Configurar HTTPS (WebAuthn e PRF **exigem** origem segura em produção)

---

## 12. Decisões de Design / Trade-offs

| Decisão | Justificação |
|---------|-------------|
| PBKDF2 em vez de Argon2 | Disponível nativamente via Web Crypto API sem dependências — zero supply-chain risk no cliente |
| 310 000 iterações PBKDF2 | Mínimo OWASP 2024 para PBKDF2-SHA256; balança segurança e UX (~300ms no browser) |
| bcrypt(authToken) no servidor | Defesa em profundidade: mesmo com DB comprometida, brute-force é computacionalmente proibitivo |
| Fail-open no Safe Browsing | Erros de rede ou API Key ausente não bloqueiam o utilizador — feature degradante graciosamente |
| Sem localStorage para chaves | Elimina superfície de ataque XSS persistente; sessão termina ao fechar o tab |
| UUID v4 para IDs | Sem inferência de sequência, sem enumeração de registos |
| Separação encKey / authToken | Garante que o servidor nunca pode derivar a chave de encriptação, mesmo conhecendo o authToken |
