import { createContext, useContext, useState } from 'react';

/**
 * Guarda em memória (React state):
 *  - token:   JWT para o backend
 *  - encKey:  CryptoKey AES-GCM (não-exportável, NUNCA vai para localStorage)
 *
 * Ao fechar/refrescar a aba, tudo desaparece — design intencional (zero persistence).
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(null); // { token, encKey, email, userId }

  const login  = (token, encKey, email, userId) => setAuth({ token, encKey, email, userId });
  const logout = () => setAuth(null);

  return (
    <AuthContext.Provider value={{ auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
