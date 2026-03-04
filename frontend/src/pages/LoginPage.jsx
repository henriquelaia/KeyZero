import { useState } from 'react';
import { Shield, Eye, EyeOff, Fingerprint, Loader2, HardDrive } from 'lucide-react';
import { deriveEncryptionKey, deriveAuthToken } from '../utils/crypto';
import { readKeyFile } from '../utils/fileAuth';
import { loginWithPasskey } from '../utils/passkeys';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function LoginPage({ onSwitch }) {
  const { login } = useAuth();
  const [email, setEmail]         = useState('');
  const [masterKey, setMasterKey] = useState('');
  const [showKey, setShowKey]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [loadingPasskey, setLoadingPasskey] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [error, setError]         = useState('');

  async function handleHardwareKeyLogin() {
    if (!email || !email.includes('@')) {
      return setError('Preencha um email válido primeiro.');
    }
    setError('');
    setLoadingFile(true);

    try {
      // 1. Pede ao user para abrir a chave no disco
      const fileKeyStr = await readKeyFile();
      if (!fileKeyStr) {
        setLoadingFile(false);
        return; // user cancelou o picker
      }

      // 2. Tenta fazer login com essa master key providenciada via ficheiro
      const { userId, salt } = await api.loginChallenge(email);
      const [encKey, authToken] = await Promise.all([
        deriveEncryptionKey(fileKeyStr, salt),
        deriveAuthToken(fileKeyStr, salt),
      ]);
      const { token } = await api.loginVerify(userId, authToken);
      login(token, encKey, email, userId);

    } catch (err) {
      if (err.message.includes('Credenciais inválidas')) {
          setError('A Chave Hardware fornecida não corresponde a este utilizador.');
      } else {
          setError(err.message || 'Erro ao ler a chave de hardware.');
      }
    } finally {
      setLoadingFile(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { userId, salt } = await api.loginChallenge(email);
      const [encKey, authToken] = await Promise.all([
        deriveEncryptionKey(masterKey, salt),
        deriveAuthToken(masterKey, salt),
      ]);
      const { token } = await api.loginVerify(userId, authToken);
      login(token, encKey, email, userId);
    } catch (err) {
      setError('Email ou MasterKey incorretos.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePasskeyLogin() {
    if (!email) {
      setError('Insira o seu email primeiro para usar a Passkey.');
      return;
    }
    setError('');
    setLoadingPasskey(true);
    try {
      const { token, encKey, userId } = await loginWithPasskey(email);
      login(token, encKey, email, userId);
    } catch (err) {
      setError(err.message || 'Erro ao autenticar com Passkey. Dispositivo não suporta PRF?');
    } finally {
      setLoadingPasskey(false);
    }
  }

  const isAnyLoading = loading || loadingPasskey || loadingFile;

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
            <label className="text-sm text-gray-400">Passphrase</label>
            <div className="relative">
              <input
                className="input pr-11"
                type={showKey ? 'text' : 'password'}
                placeholder="a tua chave mestre"
                value={masterKey}
                onChange={e => setMasterKey(e.target.value)}
                required={!loadingPasskey && !loadingFile}
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

          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={handlePasskeyLogin} className="btn-ghost flex items-center justify-center gap-2 border border-gray-700/50 py-2.5 px-2 text-sm" disabled={isAnyLoading}>
                 {loadingPasskey ? <Loader2 size={16} className="animate-spin" /> : <Fingerprint size={16} className="text-brand-light" />}
                 <span className="truncate">{loadingPasskey ? 'A verificar...' : 'Passkey local'}</span>
              </button>
              
              <button type="button" onClick={handleHardwareKeyLogin} className="btn-ghost flex items-center justify-center gap-2 border border-gray-700/50 py-2.5 px-2 text-sm" disabled={isAnyLoading}>
                 {loadingFile ? <Loader2 size={16} className="animate-spin" /> : <HardDrive size={16} className="text-brand-light" />}
                 <span className="truncate">{loadingFile ? 'A ler...' : 'Chave USB'}</span>
              </button>
            </div>
            
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-gray-800"></div>
              <span className="flex-shrink-0 mx-4 text-gray-500 text-xs">ou password</span>
              <div className="flex-grow border-t border-gray-800"></div>
            </div>

            <button type="submit" className="btn-primary w-full" disabled={isAnyLoading || !masterKey}>
              {loading ? 'A autenticar...' : 'Entrar com Passphrase'}
            </button>
          </div>

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
