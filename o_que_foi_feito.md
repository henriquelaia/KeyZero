 O que foi feito

  Responsividade

  - Badge ZK corrigido: adicionado max-w-full, shrink-0 no ícone e break-words no texto — resolve overflow em ecrãs de
  320px. O resto do código estava bem estruturado.

  Deteção de Phishing (Google Safe Browsing API)

  Backend (backend/routes/urlcheck.js):
  - Nova rota POST /api/check-url (protegida por JWT)
  - Chama a Google Safe Browsing API verificando: MALWARE, SOCIAL_ENGINEERING, UNWANTED_SOFTWARE,
  POTENTIALLY_HARMFUL_APPLICATION
  - A chave fica no backend — nunca exposta ao browser
  - Se a API não estiver configurada ou der erro, não bloqueia o utilizador (fail-safe)

  Frontend (Dashboard.jsx):
  - No formulário de adicionar/editar, ao escrever o site, espera 700ms (debounce) e verifica automaticamente
  - Mostra 3 estados visuais:
    - 🔄 "A verificar segurança do site..."
    - ✅ "Site verificado — não está na lista de ameaças"
    - ⚠️ Aviso vermelho se for phishing/malware

  ---
  Como ativar a API

  1. Vai a https://console.cloud.google.com
  2. Cria um projeto → Ativa "Safe Browsing API"
  3. Vai a Credenciais → Cria uma API Key
  4. Cola no backend/.env:
  GOOGLE_SAFE_BROWSING_KEY=AIzaSy...a_tua_chave_aqui
  5. Reinicia o backend — fica a funcionar imediatamente.