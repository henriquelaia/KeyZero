import { useState } from 'react';
import { Shield, Eye, EyeOff, CheckCircle, XCircle, HardDrive, Loader2 } from 'lucide-react';
import { validateMasterKey, deriveEncryptionKey, deriveAuthToken } from '../utils/crypto';
import { generateAndSaveKeyFile } from '../utils/fileAuth';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage({ onSwitch }) {
  const { login } = useAuth();
  const [email, setEmail]           = useState('');
  const [masterKey, setMasterKey]   = useState('');
  const [confirm, setConfirm]       = useState('');
  const [showKey, setShowKey]       = useState(false);
  const [loading, setLoading]       = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [error, setError]           = useState('');

  const keyErrors  = masterKey ? validateMasterKey(masterKey) : [];
  const isKeyValid = masterKey.length > 0 && keyErrors.length === 0;
  const isMatch    = confirm === masterKey;

  async function handleHardwareKeyRegister() {
    if (!email || !email.includes('@')) {
      return setError('Preencha um email válido primeiro.');
    }
    setError('');
    setLoadingFile(true);

    try {
      // 1. Gera e permite guardar a chave no disco
      const fileKeyStr = await generateAndSaveKeyFile();
      if (!fileKeyStr) {
        setLoadingFile(false);
        return; // user cancelou o picker
      }

      // 2. Continua o fluxo normal, usando `fileKeyStr` como MasterKey
      const { userId, salt } = await api.register(email);
      const [encKey, authToken] = await Promise.all([
        deriveEncryptionKey(fileKeyStr, salt),
        deriveAuthToken(fileKeyStr, salt),
      ]);
      const { token } = await api.registerFinalize(userId, authToken);
      login(token, encKey, email, userId);
      
    } catch (err) {
      setError(err.message || 'Erro ao criar chave de hardware.');
    } finally {
      setLoadingFile(false);
    }
  }

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

      login(token, encKey, email, userId);
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

          <div className="relative flex py-3 items-center">
             <div className="flex-grow border-t border-gray-800"></div>
             <span className="flex-shrink-0 mx-4 text-gray-500 text-xs text-center">Proteção</span>
             <div className="flex-grow border-t border-gray-800"></div>
          </div>

          {/* MasterKey */}
          <div className="space-y-1.5">
            <label className="text-sm text-gray-400">
              Passphrase Tradicional
            </label>
            <div className="relative">
              <input
                className="input pr-11"
                type={showKey ? 'text' : 'password'}
                placeholder="a tua chave mestre secreta"
                value={masterKey}
                onChange={e => setMasterKey(e.target.value)}
                required={masterKey.length > 0 || !loadingFile} // relax if doing file
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
          {masterKey && (
            <div className="space-y-1.5">
              <label className="text-sm text-gray-400">Confirmar Passphrase</label>
              <input
                className={`input ${confirm && !isMatch ? 'border-red-500' : ''}`}
                type="password"
                placeholder="repete a chave mestre"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
              />
              {confirm && !isMatch && (
                <p className="text-xs text-red-400">As chaves não coincidem.</p>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3 pt-2">
            <button
               type="button"
               onClick={handleHardwareKeyRegister}
               className="btn-ghost flex items-center justify-center gap-2 w-full border border-brand-light/30 text-brand-light hover:bg-brand-light/10"
               disabled={loading || loadingFile}
            >
               {loadingFile ? <Loader2 size={18} className="animate-spin" /> : <HardDrive size={18} />}
               {loadingFile ? 'A Guardar...' : 'Criar Chave Hardware (USB)'}
            </button>
            <button
               type="submit"
               className="btn-primary w-full mt-1"
               disabled={loading || loadingFile || !masterKey}
            >
               {loading ? 'A criar conta...' : 'Criar conta com Passphrase'}
            </button>
          </div>

          <p className="text-center text-sm text-gray-500 pt-2">
             Já tens conta?{' '}
             <button type="button" onClick={onSwitch} className="text-brand-light hover:underline">
               Entrar
             </button>
          </p>
        </form>

        <p className="text-center text-xs text-gray-600 mt-4">
          Nenhuma chave sai do teu browser. Cifrado com AES-GCM localmente.
        </p>
      </div>
    </div>
  );
}
