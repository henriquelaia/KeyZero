import { useState } from 'react';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { deriveEncryptionKey, deriveAuthToken } from '../utils/crypto';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function LoginPage({ onSwitch }) {
  const { login } = useAuth();
  const [email, setEmail]         = useState('');
  const [masterKey, setMasterKey] = useState('');
  const [showKey, setShowKey]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Passo 1: obter salt do servidor para derivar as chaves localmente
      const { userId, salt } = await api.loginChallenge(email);

      // Derivação local — masterKey fica no browser
      const [encKey, authToken] = await Promise.all([
        deriveEncryptionKey(masterKey, salt),
        deriveAuthToken(masterKey, salt),
      ]);

      // Passo 2: provar conhecimento com o authToken derivado (bcrypt no backend)
      const { token } = await api.loginVerify(userId, authToken);

      login(token, encKey, email);
    } catch (err) {
      setError('Email ou MasterKey incorretos.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center">
            <Shield size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold">KeyZero</h1>
            <p className="text-xs text-gray-400">One MasterKey. Zero Worries.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          <h2 className="text-lg font-semibold">Entrar no cofre</h2>

          <div className="space-y-1.5">
            <label className="text-sm text-gray-400">Email</label>
            <input
              className="input"
              type="email"
              placeholder="utilizador@exemplo.pt"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-gray-400">MasterKey</label>
            <div className="relative">
              <input
                className="input pr-11"
                type={showKey ? 'text' : 'password'}
                placeholder="a tua chave mestre"
                value={masterKey}
                onChange={e => setMasterKey(e.target.value)}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                onClick={() => setShowKey(v => !v)}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'A autenticar...' : 'Entrar'}
          </button>

          <p className="text-center text-sm text-gray-500">
            Ainda não tens conta?{' '}
            <button type="button" onClick={onSwitch} className="text-brand-light hover:underline">
              Criar conta
            </button>
          </p>
        </form>

        <p className="text-center text-xs text-gray-600 mt-4">
          Zero-Knowledge — o servidor nunca vê a tua MasterKey.
        </p>
      </div>
    </div>
  );
}
