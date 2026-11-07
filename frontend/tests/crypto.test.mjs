/**
 * Testes do módulo crypto do browser (Web Crypto API no Node 22+).
 * Cobre validação, round-trip, rejeição com chave errada e separação :enc/:auth
 * via vectores determinísticos (dois tokens distintos para a mesma MasterKey+salt).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveEncryptionKey,
  deriveAuthToken,
  encryptPassword,
  decryptPassword,
  validateMasterKey,
  generatePassword,
  buf2hex,
  hex2buf,
} from '../src/utils/crypto.js';

const SALT = 'a'.repeat(64); // 32 bytes hex
const MASTER = 'goodMaster1!key'; // cumpre validateMasterKey

test('validateMasterKey rejeita chaves inválidas e aceita uma válida', () => {
  assert.ok(validateMasterKey('short').length > 0);
  assert.ok(validateMasterKey('StartsUpper1!xx').some((e) => /maiúscula/i.test(e)));
  assert.ok(validateMasterKey('nouppercasehere1!').length > 0);
  assert.ok(validateMasterKey('noNumberHere!!XX').length > 0);
  assert.ok(validateMasterKey('noSymbolHere1abc').length > 0);
  assert.ok(validateMasterKey('endsWithDigit1').some((e) => /número/i.test(e)));
  assert.deepEqual(validateMasterKey(MASTER), []);
});

test('deriveAuthToken é determinístico para a mesma MasterKey+salt', async () => {
  const a = await deriveAuthToken(MASTER, SALT);
  const b = await deriveAuthToken(MASTER, SALT);
  assert.equal(a, b);
  assert.equal(a.length, 64); // 256-bit hex
});

test('deriveAuthToken muda com MasterKey ou salt diferentes', async () => {
  const base = await deriveAuthToken(MASTER, SALT);
  const otherKey = await deriveAuthToken('otherMaster1!xx', SALT);
  const otherSalt = await deriveAuthToken(MASTER, 'b'.repeat(64));
  assert.notEqual(base, otherKey);
  assert.notEqual(base, otherSalt);
});

test('authToken (:auth) é distinto do material derivado com sufixo :enc (vectores hex)', async () => {
  // Não comparar CryptoKey com string. Derivar bits com o mesmo padrão :enc/:auth
  // usado em crypto.js e verificar que os digests hex são diferentes.
  const auth = await deriveAuthToken(MASTER, SALT);
  const encMat = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(MASTER + ':enc'),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const encBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hex2buf(SALT), iterations: 310_000, hash: 'SHA-256' },
    encMat,
    256,
  );
  const encHex = buf2hex(encBits);
  assert.notEqual(auth, encHex);
  assert.equal(auth.length, encHex.length);
});

test('encryptPassword / decryptPassword round-trip', async () => {
  const key = await deriveEncryptionKey(MASTER, SALT);
  const blob = await encryptPassword('segredo-sintético', key);
  const plain = await decryptPassword(blob, key);
  assert.equal(plain, 'segredo-sintético');
  const parsed = JSON.parse(blob);
  assert.ok(parsed.ct && parsed.iv);
  assert.ok(!blob.includes('segredo-sintético'));
});

test('decryptPassword falha com chave errada ou ciphertext adulterado', async () => {
  const key = await deriveEncryptionKey(MASTER, SALT);
  const other = await deriveEncryptionKey('otherMaster1!xx', SALT);
  const blob = await encryptPassword('payload', key);
  await assert.rejects(() => decryptPassword(blob, other));
  const parsed = JSON.parse(blob);
  parsed.ct = parsed.ct.slice(0, -2) + (parsed.ct.endsWith('AA') ? 'BB' : 'AA');
  await assert.rejects(() => decryptPassword(JSON.stringify(parsed), key));
});

test('generatePassword cumpre requisitos mínimos', () => {
  const pass = generatePassword(20);
  assert.equal(pass.length, 20);
  assert.match(pass, /[A-Z]/);
  assert.match(pass, /[0-9]/);
  assert.match(pass, /[^a-zA-Z0-9]/);
});
