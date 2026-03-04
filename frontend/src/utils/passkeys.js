import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { deriveEncryptionKey, deriveAuthToken, buf2hex, hex2buf } from './crypto';

const API_BASE = '/api';

const requestJSON = async (url, options = {}) => {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro de rede');
  return data;
};

// ─── REGISTO DE PASSKEY ──────────────────────────────────────────────────────

/**
 * Associa uma nova Passkey à conta do utilizador autenticado.
 * Tem de ser chamado quando o utilizador já está logado.
 */
export async function registerPasskey(userId) {
  try {
    // 1. Pedir opções de registo ao backend
    const options = await requestJSON('/auth/passkeys/register/options', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });

    // 2. Chamar a API WebAuthn do Browser
    const authResponse = await startRegistration({ optionsJSON: options });

    // 3. Enviar a resposta para o backend verificar e guardar
    const verification = await requestJSON('/auth/passkeys/register/verify', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        response: authResponse,
      }),
    });

    return verification.verified;
  } catch (error) {
    console.error('Erro a registar Passkey:', error);
    throw error;
  }
}

// ─── LOGIN COM PASSKEY ───────────────────────────────────────────────────────

/**
 * Inicia o login com Passkey.
 * Extrai o output do PRF, e usa isso como "MasterKey" invisível
 * para derivar chaves.
 */
export async function loginWithPasskey(email) {
  try {
    // 1. Pedir opções de login ao backend
    const { options, salt } = await requestJSON('/auth/passkeys/login/options', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });

    // 2. Chamar a API WebAuthn do Browser, e pedir explicitamente PRF eval
    const authResponse = await startAuthentication({
      optionsJSON: options,
      useBrowserAutofill: false, // Pode ser true se usarmos Conditional UI
    });

    // Validar se o PRF devolveu dados
    const prfResults = authResponse.clientExtensionResults.prf;
    if (!prfResults || !prfResults.results || !prfResults.results.first) {
       console.warn("Autenticador não devolveu resultados PRF. Pode não suportar PRF.");
       // Fallback seria necessário, mas KeyZero necessita de PRF para Zero-Knowledge!
       throw new Error("O seu dispositivo/browser não suporta a extensão WebAuthn PRF, necessária para o KeyZero Zero-Knowledge com Passkeys.");
    }

    // O PRF devolve um ArrayBuffer com a nossa seed simétrica
    const prfKeyStr = buf2hex(prfResults.results.first);

    // 3. O servidor valida a resposta WebAuthn
    const verification = await requestJSON('/auth/passkeys/login/verify', {
      method: 'POST',
      body: JSON.stringify({
        email,
        response: authResponse,
      }),
    });

    if (verification.verified) {
      // 4. Derivar chaves usando a PRF Key como se fosse a MasterKey
      // Assim o servidor NUNCA sabe a PRF Key.
      // O PRF foi instanciado independentemente por cada Key do utilizador.
      const encKey = await deriveEncryptionKey(prfKeyStr, salt);
      const authToken = await deriveAuthToken(prfKeyStr, salt); // Isto seria para login clássico se necessário

      return {
        token: verification.token,
        userId: verification.userId,
        encKey,
        prfKeyStr // Apenas para mostrar na UI, ou usar em context
      };
    }
  } catch (error) {
    console.error('Erro no login com Passkey:', error);
    throw error;
  }
}
