import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield, Plus, Search, LogOut, Eye, EyeOff, Copy, Trash2,
  Pencil, RefreshCw, X, Check, Lock, Globe, User, KeyRound,
  AlertTriangle, ShieldCheck, Loader2,
} from 'lucide-react';
import { encryptPassword, decryptPassword, generatePassword } from '../utils/crypto';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type = 'success', onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 2500); return () => clearTimeout(t); }, [onClose]);
  const color = type === 'success' ? 'bg-green-500/20 border-green-500/40 text-green-300'
                                   : 'bg-red-500/20 border-red-500/40 text-red-300';
  return (
    <div className={`fixed bottom-5 right-5 z-50 border rounded-xl px-5 py-3 text-sm flex items-center gap-2 shadow-lg ${color}`}>
      {type === 'success' ? <Check size={14} /> : <X size={14} />}
      {msg}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ─── PhishingBadge ────────────────────────────────────────────────────────────
function PhishingBadge({ status }) {
  if (status === 'checking') return (
    <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-1.5">
      <Loader2 size={12} className="animate-spin" />
      A verificar segurança do site...
    </div>
  );
  if (status === 'unsafe') return (
    <div className="flex items-center gap-1.5 text-xs text-red-400 mt-1.5 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
      <AlertTriangle size={13} className="shrink-0" />
      <span><strong>Atenção:</strong> Este site foi reportado como phishing ou malware pela Google Safe Browsing. Tens a certeza?</span>
    </div>
  );
  if (status === 'safe') return (
    <div className="flex items-center gap-1.5 text-xs text-green-400 mt-1.5">
      <ShieldCheck size={12} />
      Site verificado — não está na lista de ameaças conhecidas.
    </div>
  );
  return null;
}

// ─── PasswordForm (Criar / Editar) ────────────────────────────────────────────
function PasswordForm({ initial, onSave, onClose, loading, token }) {
  const [site, setSite]           = useState(initial?.site     || '');
  const [username, setUsername]   = useState(initial?.username || '');
  const [password, setPassword]   = useState(initial?.plaintext || '');
  const [showPw, setShowPw]       = useState(false);
  const [phishing, setPhishing]   = useState(null); // null | 'checking' | 'safe' | 'unsafe'
  const debounceRef               = useRef(null);

  function handleSiteChange(value) {
    setSite(value);
    setPhishing(null);
    clearTimeout(debounceRef.current);
    if (!value.trim()) return;

    debounceRef.current = setTimeout(async () => {
      setPhishing('checking');
      try {
        // Normalizar: adicionar https:// se não tiver protocolo
        const urlToCheck = /^https?:\/\//i.test(value) ? value : `https://${value}`;
        const result = await api.checkUrl(token, urlToCheck);
        setPhishing(result.safe ? 'safe' : 'unsafe');
      } catch {
        setPhishing(null); // não bloquear em caso de erro
      }
    }, 700);
  }

  function generate() {
    setPassword(generatePassword(20));
    setShowPw(true);
  }

  return (
    <form onSubmit={e => { e.preventDefault(); onSave({ site, username, password }); }} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm text-gray-400 flex items-center gap-1.5"><Globe size={13} /> Site / Aplicação</label>
        <input className="input" placeholder="ex: github.com" value={site} onChange={e => handleSiteChange(e.target.value)} required />
        <PhishingBadge status={phishing} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm text-gray-400 flex items-center gap-1.5"><User size={13} /> Username / Email</label>
        <input className="input" placeholder="utilizador@exemplo.pt" value={username} onChange={e => setUsername(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm text-gray-400 flex items-center gap-1.5"><KeyRound size={13} /> Password</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              className="input pr-10"
              type={showPw ? 'text' : 'password'}
              placeholder="password do site"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <button type="button" onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button type="button" onClick={generate} className="btn-ghost px-3" title="Gerar password segura">
            <RefreshCw size={15} />
          </button>
        </div>
        <p className="text-xs text-gray-600">Gerador usa window.crypto.getRandomValues (CSPRNG)</p>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
        <button type="submit" className="btn-primary flex-1" disabled={loading}>
          {loading ? 'A guardar...' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

// ─── PasswordCard ─────────────────────────────────────────────────────────────
function PasswordCard({ entry, onEdit, onDelete }) {
  const [show, setShow]     = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(entry.plaintext);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const initials = (entry.site || '?')[0].toUpperCase();
  const colors   = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-orange-500', 'bg-pink-500'];
  const color    = colors[initials.charCodeAt(0) % colors.length];

  return (
    <div className="card flex flex-col gap-4 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 ${color} rounded-lg flex items-center justify-center text-sm font-bold shrink-0`}>
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate">{entry.site}</p>
            {entry.username && <p className="text-xs text-gray-400 truncate">{entry.username}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onEdit(entry)} className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition">
            <Pencil size={14} />
          </button>
          <button onClick={() => onDelete(entry)} className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-gray-950 rounded-lg px-3 py-2">
        <Lock size={12} className="text-gray-600 shrink-0" />
        <span className="flex-1 font-mono text-sm truncate text-gray-300">
          {show ? entry.plaintext : '••••••••••••'}
        </span>
        <button onClick={() => setShow(v => !v)} className="text-gray-400 hover:text-white p-1">
          {show ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        <button onClick={copy} className="text-gray-400 hover:text-white p-1">
          {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}

// ─── Dashboard Principal ──────────────────────────────────────────────────────
export default function Dashboard() {
  const { auth, logout } = useAuth();
  const { token, encKey, email } = auth;

  const [entries, setEntries]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [modal, setModal]         = useState(null); // null | 'create' | { ...entry }
  const [deleteTarget, setDelete] = useState(null);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState(null);

  const notify = (msg, type = 'success') => setToast({ msg, type });

  // ─── Carregar passwords ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.getPasswords(token);
      const decrypted = await Promise.all(
        rows.map(async r => ({
          ...r,
          plaintext: await decryptPassword(r.encrypted_password, encKey).catch(() => '[erro ao decifrar]'),
        }))
      );
      setEntries(decrypted);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [token, encKey]);

  useEffect(() => { load(); }, [load]);

  // ─── Criar ────────────────────────────────────────────────────────────────
  async function handleCreate({ site, username, password }) {
    setSaving(true);
    try {
      const enc   = await encryptPassword(password, encKey);
      const entry = await api.createPassword(token, site, username, enc);
      setEntries(prev => [{ ...entry, plaintext: password }, ...prev]);
      setModal(null);
      notify('Password guardada no cofre.');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ─── Editar ───────────────────────────────────────────────────────────────
  async function handleEdit({ site, username, password }) {
    setSaving(true);
    try {
      const enc = await encryptPassword(password, encKey);
      await api.updatePassword(token, modal.id, site, username, enc);
      setEntries(prev => prev.map(e => e.id === modal.id
        ? { ...e, site, username, encrypted_password: enc, plaintext: password }
        : e
      ));
      setModal(null);
      notify('Password actualizada.');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ─── Apagar ───────────────────────────────────────────────────────────────
  async function handleDelete() {
    setSaving(true);
    try {
      await api.deletePassword(token, deleteTarget.id);
      setEntries(prev => prev.filter(e => e.id !== deleteTarget.id));
      setDelete(null);
      notify('Password eliminada.');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const filtered = entries.filter(e =>
    e.site.toLowerCase().includes(search.toLowerCase()) ||
    (e.username || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">

      {/* ─── Header ─── */}
      <header className="border-b border-gray-900 px-4 md:px-8 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center shrink-0">
            <Shield size={16} />
          </div>
          <span className="font-bold text-lg hidden sm:block">KeyZero</span>
        </div>

        <div className="flex-1 max-w-sm relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="input pl-9 py-2 text-sm"
            placeholder="Pesquisar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-400 hidden md:block truncate max-w-[180px]">{email}</p>
          <button onClick={logout} className="btn-ghost py-2 px-3 flex items-center gap-2 text-sm">
            <LogOut size={15} />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      {/* ─── Main ─── */}
      <main className="flex-1 px-4 md:px-8 py-6 max-w-5xl mx-auto w-full">

        {/* Stats + Botão */}
        <div className="flex items-center justify-between mb-6 gap-4">
          <div>
            <h2 className="text-xl font-semibold">O meu Cofre</h2>
            <p className="text-sm text-gray-400">
              {loading ? 'A carregar...' : `${entries.length} password${entries.length !== 1 ? 's' : ''} guardada${entries.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={() => setModal('create')} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            <span>Adicionar</span>
          </button>
        </div>

        {/* ZK Badge */}
        <div className="flex items-center gap-2 mb-6 bg-brand/10 border border-brand/20 rounded-xl px-4 py-2.5 max-w-full w-fit">
          <Lock size={13} className="text-brand-light shrink-0" />
          <p className="text-xs text-brand-light break-words">
            Cifrado com AES-GCM 256-bit · Chave derivada via PBKDF2 · Zero-Knowledge
          </p>
        </div>

        {/* Grid de passwords */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card h-32 animate-pulse bg-gray-800/50" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mb-4">
              <KeyRound size={28} className="text-gray-600" />
            </div>
            <p className="text-gray-400 font-medium">
              {search ? 'Nenhum resultado encontrado.' : 'O cofre está vazio.'}
            </p>
            {!search && (
              <button onClick={() => setModal('create')} className="btn-primary mt-4 text-sm">
                Adicionar primeira password
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(entry => (
              <PasswordCard
                key={entry.id}
                entry={entry}
                onEdit={e => setModal(e)}
                onDelete={e => setDelete(e)}
              />
            ))}
          </div>
        )}
      </main>

      {/* ─── Modal Criar ─── */}
      {modal === 'create' && (
        <Modal title="Nova password" onClose={() => setModal(null)}>
          <PasswordForm onSave={handleCreate} onClose={() => setModal(null)} loading={saving} token={token} />
        </Modal>
      )}

      {/* ─── Modal Editar ─── */}
      {modal && modal !== 'create' && (
        <Modal title="Editar password" onClose={() => setModal(null)}>
          <PasswordForm initial={modal} onSave={handleEdit} onClose={() => setModal(null)} loading={saving} token={token} />
        </Modal>
      )}

      {/* ─── Modal Confirmar Apagar ─── */}
      {deleteTarget && (
        <Modal title="Eliminar password" onClose={() => setDelete(null)}>
          <p className="text-gray-300 mb-6">
            Tens a certeza que queres eliminar a password de{' '}
            <strong className="text-white">{deleteTarget.site}</strong>?
            Esta ação é irreversível.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setDelete(null)} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={handleDelete} className="btn-danger flex-1" disabled={saving}>
              {saving ? 'A eliminar...' : 'Eliminar'}
            </button>
          </div>
        </Modal>
      )}

      {/* ─── Toast ─── */}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
