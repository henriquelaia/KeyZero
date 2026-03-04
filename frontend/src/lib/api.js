/**
 * KeyZero — Cliente HTTP
 * Todas as chamadas passam o JWT no header Authorization.
 */

const BASE = '/api';

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro de rede.');
  return data;
}

export const api = {
  // Auth
  register:         (email)              => request('POST', '/auth/register',          { email }),
  registerFinalize: (userId, authToken)  => request('POST', '/auth/register/finalize', { userId, authToken }),
  loginChallenge:   (email)              => request('POST', '/auth/login',              { email }),
  loginVerify:      (userId, authToken)  => request('POST', '/auth/login/verify',       { userId, authToken }),

  // Passwords (autenticados)
  getPasswords:   (token)                            => request('GET',    '/passwords',        null,                        token),
  createPassword: (token, site, username, enc)       => request('POST',   '/passwords',        { site, username, encrypted_password: enc }, token),
  updatePassword: (token, id, site, username, enc)   => request('PUT',    `/passwords/${id}`,  { site, username, encrypted_password: enc }, token),
  deletePassword: (token, id)                        => request('DELETE', `/passwords/${id}`,  null,                        token),

  // Segurança
  checkUrl: (token, url) => request('POST', '/check-url', { url }, token),
};
