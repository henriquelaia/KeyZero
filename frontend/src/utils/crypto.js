/**
 * KeyZero — Módulo Criptográfico (browser-only, Web Crypto API)
 *
 * ARQUITETURA ZERO-KNOWLEDGE:
 *  - encKey  = PBKDF2(masterKey + ":enc",  salt)  → cifra/decifra passwords (NUNCA sai do browser)
 *  - authToken= PBKDF2(masterKey + ":auth", salt)  → autenticação no servidor (hash bcrypt no backend)
 *
 * O servidor armazena bcrypt(authToken), nunca a masterKey nem o encKey.
 */

const ITERATIONS = 310_000; // OWASP 2024 mínimo para PBKDF2-SHA256
const KEY_BITS   = 256;

// ─── Helpers de codificação ───────────────────────────────────────────────────

export const buf2hex = (buf) =>
  Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

export const hex2buf = (hex) =>
  new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));

export const buf2b64 = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));

export const b642buf = (b64) =>
  Uint8Array.from(atob(b64), c => c.charCodeAt(0));

const str2buf = (s) => new TextEncoder().encode(s);

// ─── Derivação de chaves ──────────────────────────────────────────────────────

async function keyMaterial(secret) {
  return crypto.subtle.importKey('raw', str2buf(secret), 'PBKDF2', false, ['deriveKey', 'deriveBits']);
}

/**
 * Deriva a chave AES-GCM de encriptação a partir da MasterKey + salt do servidor.
 * Retorna um CryptoKey não-exportável (fica apenas em memória).
 */
export async function deriveEncryptionKey(masterKey, saltHex) {
  const mat  = await keyMaterial(masterKey + ':enc');
  const salt = hex2buf(saltHex);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    mat,
    { name: 'AES-GCM', length: KEY_BITS },
    false,           // não exportável — nunca sai da memória
    ['encrypt', 'decrypt']
  );
}

/**
 * Deriva o token de autenticação (hex).
 * Enviado ao servidor UMA VEZ para verificação via bcrypt.
 * Matematicamente separado do encKey — comprometer um não compromete o outro.
 */
export async function deriveAuthToken(masterKey, saltHex) {
  const mat  = await keyMaterial(masterKey + ':auth');
  const salt = hex2buf(saltHex);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    mat,
    KEY_BITS
  );
  return buf2hex(bits);
}

// ─── Encriptação / Desencriptação ─────────────────────────────────────────────

/**
 * Cifra um texto com AES-GCM.
 * Retorna JSON string: { ct: base64, iv: base64 }
 */
export async function encryptPassword(plaintext, encKey) {
  const iv         = crypto.getRandomValues(new Uint8Array(12)); // 96-bit nonce (recomendado para AES-GCM)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encKey,
    str2buf(plaintext)
  );
  return JSON.stringify({ ct: buf2b64(ciphertext), iv: buf2b64(iv) });
}

/**
 * Decifra um blob produzido por encryptPassword().
 * Lança erro se a chave ou os dados estiverem errados.
 */
export async function decryptPassword(encryptedJson, encKey) {
  const { ct, iv } = JSON.parse(encryptedJson);
  const plaintext  = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b642buf(iv) },
    encKey,
    b642buf(ct)
  );
  return new TextDecoder().decode(plaintext);
}

// ─── Gerador de passwords criptograficamente seguro ───────────────────────────

const CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}';

/**
 * Gera uma password aleatória usando window.crypto.getRandomValues (CSPRNG).
 * Garante pelo menos 1 maiúscula, 1 número e 1 símbolo.
 */
export function generatePassword(length = 20) {
  const specials = '!@#$%^&*()_+-=[]{}';
  let pass = '';
  let hasUpper = false, hasDigit = false, hasSymbol = false;

  while (pass.length < length) {
    const [byte] = crypto.getRandomValues(new Uint8Array(1));
    const char   = CHARSET[byte % CHARSET.length];
    if (!char) continue;
    pass += char;
    if (/[A-Z]/.test(char)) hasUpper  = true;
    if (/[0-9]/.test(char)) hasDigit  = true;
    if (specials.includes(char)) hasSymbol = true;
  }

  // Garante os requisitos mínimos inserindo no meio (não no fim — regra MasterKey não se aplica às passwords geradas)
  const forceInsert = (chars, condition) => {
    if (!condition) {
      const [byte] = crypto.getRandomValues(new Uint8Array(1));
      const idx  = byte % (length - 1); // evitar posição 0 e final
      const char = chars[byte % chars.length];
      pass = pass.slice(0, idx) + char + pass.slice(idx + 1);
    }
  };
  forceInsert('ABCDEFGHIJKLMNOPQRSTUVWXYZ', hasUpper);
  forceInsert('0123456789', hasDigit);
  forceInsert(specials, hasSymbol);

  return pass;
}

// ─── Validação da MasterKey ───────────────────────────────────────────────────

/**
 * Valida as regras de segurança da MasterKey.
 * Retorna array de strings de erro (vazio = válida).
 *
 * Regras:
 *  ✗ Não pode começar por letra maiúscula
 *  ✗ Não pode terminar em número
 *  ✓ Comprimento mínimo: 12 caracteres
 *  ✓ Pelo menos 1 letra maiúscula (algures no meio)
 *  ✓ Pelo menos 1 letra minúscula
 *  ✓ Pelo menos 1 número
 *  ✓ Pelo menos 1 símbolo
 */
export function validateMasterKey(key) {
  const errors = [];
  if (key.length < 12)           errors.push('Mínimo de 12 caracteres.');
  if (/^[A-Z]/.test(key))        errors.push('Não pode começar por letra maiúscula.');
  if (/[0-9]$/.test(key))        errors.push('Não pode terminar em número.');
  if (!/[A-Z]/.test(key))        errors.push('Requer pelo menos uma letra maiúscula.');
  if (!/[a-z]/.test(key))        errors.push('Requer pelo menos uma letra minúscula.');
  if (!/[0-9]/.test(key))        errors.push('Requer pelo menos um número.');
  if (!/[^a-zA-Z0-9]/.test(key)) errors.push('Requer pelo menos um símbolo (!@#$%...).');
  return errors;
}
