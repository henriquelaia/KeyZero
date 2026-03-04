import { useState } from 'react';
import { Shield, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import { validateMasterKey, deriveEncryptionKey, deriveAuthToken } from '../utils/crypto';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage({ onSwitch }) {
  const { login } = useAuth();
  const [email, setEmail]           = useState('');
  const [masterKey, setMasterKey]   = useState('');
  const [confirm, setConfirm]       = useState('');
  const [showKey, setShowKey]       = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const keyErrors  = masterKey ? validateMasterKey(masterKey) : [];
  const isKeyValid = masterKey.length > 0 && keyErrors.length === 0;
  const isMatch    = confirm === masterKey;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (keyErrors.length) return setError(keyErrors[0]);
    if (!isMatch) return setError('As MasterKeys não coincidem.');

    setLoading(true);
    try {
      // Passo 1: obter salt do servidor
      const { userId, salt } = await api.register(email);

      // Derivação local (nunca enviada ao servidor como plaintext)
      const [encKey, authToken] = await Promise.all([
        deriveEncryptionKey(masterKey, salt),
        deriveAuthToken(masterKey, salt),
      ]);

      // Passo 2: enviar authToken (derivado, não a masterKey) para finalizar
      const { token } = await api.registerFinalize(userId, authToken);

      login(token, encKey, email);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const rules = [
    { label: 'Mínimo 12 caracteres',          ok: masterKey.length >= 12 },
    { label: 'Não começa por maiúscula',       ok: masterKey.length > 0 && !/^[A-Z]/.test(masterKey) },
    { label: 'Não termina em número',          ok: masterKey.length > 0 && !/[0-9]$/.test(masterKey) },
    { label: 'Pelo menos 1 maiúscula',         ok: /[A-Z]/.test(masterKey) },
    { label: 'Pelo menos 1 número',            ok: /[0-9]/.test(masterKey) },
    { label: 'Pelo menos 1 símbolo (!@#...)',  ok: /[^a-zA-Z0-9]/.test(masterKey) },
  ];

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
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
          <h2 className="text-lg font-semibold">Criar conta</h2>

          {/* Email */}
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

          {/* MasterKey */}
          <div className="space-y-1.5">
            <label className="text-sm text-gray-400">
              MasterKey
              <span className="ml-2 text-xs text-brand-light">nunca enviada ao servidor</span>
            </label>
            <div className="relative">
              <input
                className="input pr-11"
                type={showKey ? 'text' : 'password'}
                placeholder="a tua chave mestre secreta"
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

            {/* Indicador de regras */}
            {masterKey && (
              <div className="grid grid-cols-2 gap-1 mt-2">
                {rules.map(r => (
                  <div key={r.label} className="flex items-center gap-1.5 text-xs">
                    {r.ok
                      ? <CheckCircle size={12} className="text-green-400 shrink-0" />
                      : <XCircle    size={12} className="text-gray-600 shrink-0" />}
                    <span className={r.ok ? 'text-gray-300' : 'text-gray-500'}>{r.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Confirmar MasterKey */}
          <div className="space-y-1.5">
            <label className="text-sm text-gray-400">Confirmar MasterKey</label>
            <input
              className={`input ${confirm && !isMatch ? 'border-red-500' : ''}`}
              type="password"
              placeholder="repete a chave mestre"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
            />
            {confirm && !isMatch && (
              <p className="text-xs text-red-400">As MasterKeys não coincidem.</p>
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading || !isKeyValid || !isMatch || !email}
          >
            {loading ? 'A criar conta...' : 'Criar conta'}
          </button>

          <p className="text-center text-sm text-gray-500">
            Já tens conta?{' '}
            <button type="button" onClick={onSwitch} className="text-brand-light hover:underline">
              Entrar
            </button>
          </p>
        </form>

        <p className="text-center text-xs text-gray-600 mt-4">
          A MasterKey nunca sai do teu browser. Usa PBKDF2 + AES-GCM.
        </p>
      </div>
    </div>
  );
}
