import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Phone, CheckCircle, AlertTriangle, Pause, Play, Save, Plus, Trash2, RefreshCw, Database, ChevronDown, ChevronUp } from 'lucide-react';
import { botsApi } from '../lib/api.js';
import { useAsyncFn } from '../hooks/useApi.js';
import { PageLoader } from '../components/LoadingSpinner.jsx';
import Alert from '../components/Alert.jsx';

const AR_PHONE_RE = /^549\d{10}$/;
const KB_INTERVALS = [
  { value: 1,  label: 'Cada 1 min'  },
  { value: 5,  label: 'Cada 5 min'  },
  { value: 10, label: 'Cada 10 min' },
  { value: 30, label: 'Cada 30 min' },
  { value: 60, label: 'Cada hora'   },
];

function formatPhone(raw) {
  if (!raw) return null;
  if (/^549\d{10}$/.test(raw)) return `+54 9 ${raw.slice(3,5)} ${raw.slice(5,9)}-${raw.slice(9)}`;
  return raw;
}

function newKb() {
  return { _isNew: true, name: '', enabled: true, sourceUrl: '', refreshIntervalMinutes: 1, status: 'idle', lastFetched: null, lastError: '', content: '' };
}

function KbStatusBadge({ status, lastFetched, lastError }) {
  if (status === 'ok') return (
    <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
      <CheckCircle className="w-3 h-3" /> {lastFetched ? new Date(lastFetched).toLocaleTimeString('es-AR') : 'OK'}
    </span>
  );
  if (status === 'error') return (
    <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium" title={lastError}>
      <AlertTriangle className="w-3 h-3" /> Error
    </span>
  );
  return <span className="text-xs text-gray-400">Pendiente</span>;
}

export default function ConfigureBot() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [bot, setBot]             = useState(null);
  const [loading, setLoading]     = useState(true);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [faqs, setFaqs]           = useState([{ question: '', answer: '' }]);
  const [kbs, setKbs]             = useState([]);
  const [expandedKbs, setExpandedKbs] = useState(new Set());
  const [syncingKbs, setSyncingKbs]   = useState(new Set());
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg]   = useState('');

  const assignNumber = useAsyncFn(phone => botsApi.assignNumber(id, phone));
  const saveBot      = useAsyncFn(data  => botsApi.update(id, data));
  const uploadFaqs   = useAsyncFn(list  => botsApi.uploadFaqs(id, list));

  const flash = (msg, isError = false) => {
    if (isError) setErrorMsg(msg); else setSuccessMsg(msg);
    setTimeout(() => { setSuccessMsg(''); setErrorMsg(''); }, 3000);
  };

  useEffect(() => {
    botsApi.get(id)
      .then(b => {
        setBot(b);
        setPhoneInput(b.phoneNumber || '');
        setSystemPrompt(b.systemPrompt || '');
        setFaqs(b.faqs?.length ? b.faqs : [{ question: '', answer: '' }]);
        setKbs(b.knowledgeBases ?? []);
        setExpandedKbs(new Set((b.knowledgeBases ?? []).map((_, i) => i)));
      })
      .catch(() => navigate('/bots'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleAssignNumber = async () => {
    const clean = phoneInput.replace(/\D/g, '');
    if (!AR_PHONE_RE.test(clean)) {
      setPhoneError('Número inválido. Formato: 549XXXXXXXXXX (ej: 5491123456789)');
      return;
    }
    setPhoneError('');
    try {
      const result = await assignNumber.execute(clean);
      setBot(prev => ({ ...prev, phoneNumber: clean, evolutionInstanceName: result.instanceName }));
      flash('Número asignado correctamente');
    } catch (e) { setPhoneError(e.message); }
  };

  const handlePauseResume = async () => {
    const isActive = (bot.status ?? 'active') === 'active';
    try {
      const result = isActive ? await botsApi.pause(id) : await botsApi.resume(id);
      setBot(prev => ({ ...prev, status: result.status }));
      flash(isActive ? 'Bot pausado' : 'Bot reanudado');
    } catch (e) { flash(e.message, true); }
  };

  const handleSave = async () => {
    try {
      const validFaqs = faqs.filter(f => f.question?.trim() && f.answer?.trim());
      await Promise.all([
        saveBot.execute({ systemPrompt, knowledgeBases: kbs.map(({ _isNew, ...kb }) => kb) }),
        botsApi.uploadFaqs(id, validFaqs),
      ]);
      flash('Cambios guardados');
    } catch (e) { flash(e.message, true); }
  };

  // KB helpers
  const addKb    = () => { const i = kbs.length; setKbs(k => [...k, newKb()]); setExpandedKbs(s => new Set([...s, i])); };
  const removeKb = i => { setKbs(k => k.filter((_, idx) => idx !== i)); setExpandedKbs(s => { const n = new Set(); s.forEach(v => { if (v < i) n.add(v); else if (v > i) n.add(v - 1); }); return n; }); };
  const updateKb = (i, key, val) => setKbs(k => k.map((kb, idx) => idx === i ? { ...kb, [key]: val } : kb));
  const toggleExpand = i => setExpandedKbs(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const handleSyncOne = async (kbId, i) => {
    setSyncingKbs(s => new Set([...s, kbId]));
    try {
      const updated = await botsApi.syncOneKb(id, kbId);
      setKbs(updated);
      flash('Sincronizado');
    } catch (e) { flash(e.message, true); } finally { setSyncingKbs(s => { const n = new Set(s); n.delete(kbId); return n; }); }
  };

  const addFaq    = () => setFaqs(f => [...f, { question: '', answer: '' }]);
  const removeFaq = i => setFaqs(f => f.filter((_, idx) => idx !== i));
  const updateFaq = (i, k, v) => setFaqs(f => f.map((faq, idx) => idx === i ? { ...faq, [k]: v } : faq));

  if (loading) return <PageLoader />;

  const isActive = (bot?.status ?? 'active') === 'active';
  const phone = formatPhone(bot?.phoneNumber);
  const hasInstance = !!bot?.evolutionInstanceName;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/bots')} className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{bot?.name}</h1>
          <p className="text-gray-500 text-sm mt-0.5">Configuración del bot</p>
        </div>
      </div>

      {successMsg && <Alert type="success" message={successMsg} className="mb-4" />}
      {errorMsg   && <Alert type="error"   message={errorMsg}   className="mb-4" />}

      <div className="space-y-5">
        {/* ── Phone number ───────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Phone className="w-4 h-4 text-primary-500" />
            <h2 className="font-semibold text-gray-900">Número de teléfono</h2>
          </div>

          {phone ? (
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
              <span className="text-green-700 font-mono font-semibold">{phone}</span>
              <span className="text-xs text-gray-400">asignado</span>
            </div>
          ) : (
            <p className="text-sm text-gray-500 mb-3">Sin número asignado — el bot no puede recibir mensajes.</p>
          )}

          <div className="flex gap-2">
            <input
              className="input flex-1 font-mono text-sm"
              placeholder="+54 9 11 1234-5678  →  549XXXXXXXXXX"
              value={phoneInput}
              onChange={e => { setPhoneInput(e.target.value); setPhoneError(''); }}
            />
            <button onClick={handleAssignNumber} disabled={assignNumber.loading}
              className="btn-primary px-4 text-sm flex-shrink-0">
              {assignNumber.loading ? 'Asignando...' : phone ? 'Cambiar' : 'Asignar'}
            </button>
          </div>
          {phoneError && <p className="text-red-500 text-xs mt-1.5">{phoneError}</p>}
          <p className="text-xs text-gray-400 mt-2">
            Formato: <span className="font-mono">549</span> + área + número (ej: <span className="font-mono">5491112345678</span>).
            {hasInstance && <span className="ml-2 text-primary-500">Instancia Evolution: <span className="font-mono">{bot.evolutionInstanceName}</span></span>}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            URL del webhook Evolution API: <span className="font-mono select-all">{window.location.origin}/webhook/evolution</span>
          </p>
        </div>

        {/* ── Status ─────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900 mb-1">Estado del bot</h2>
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${
                isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-400'}`} />
                {isActive ? '🟢 ACTIVO' : '🔴 PAUSADO'}
              </div>
            </div>
            <button onClick={handlePauseResume}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                isActive
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}>
              {isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isActive ? 'PAUSAR BOT' : 'REANUDAR BOT'}
            </button>
          </div>
        </div>

        {/* ── System Prompt ──────────────────────────────────────── */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-3">Personalidad / System Prompt</h2>
          <textarea
            className="input h-44 resize-none font-mono text-sm"
            placeholder="Describe cómo debe comportarse el bot..."
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
          />
          <p className="text-xs text-gray-400 mt-1">{systemPrompt.length} caracteres</p>
        </div>

        {/* ── FAQs ──────────────────────────────────────────────── */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-3">Preguntas Frecuentes (FAQs)</h2>
          <div className="space-y-2">
            {faqs.map((faq, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <input className="input text-sm" placeholder="Pregunta" value={faq.question}
                    onChange={e => updateFaq(i, 'question', e.target.value)} />
                  <input className="input text-sm" placeholder="Respuesta" value={faq.answer}
                    onChange={e => updateFaq(i, 'answer', e.target.value)} />
                </div>
                <button type="button" onClick={() => removeFaq(i)} disabled={faqs.length === 1}
                  className="text-gray-400 hover:text-red-500 transition-colors pt-2">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button type="button" onClick={addFaq}
              className="flex items-center gap-1 text-sm text-primary-500 hover:text-primary-700 font-medium">
              <Plus className="w-4 h-4" /> Agregar FAQ
            </button>
          </div>
        </div>

        {/* ── Knowledge Bases ────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-primary-500" />
              <h2 className="font-semibold text-gray-900">Bases de conocimiento</h2>
              {kbs.length > 0 && (
                <span className="text-xs bg-primary-100 text-primary-600 font-semibold px-2 py-0.5 rounded-full">{kbs.length}</span>
              )}
            </div>
            <button type="button" onClick={addKb} disabled={kbs.length >= 10}
              className="btn-secondary text-xs py-1.5 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Agregar
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Vinculá documentos de Google Docs, Sheets, SharePoint u otras URLs. El contenido se inyecta automáticamente en el system prompt.
          </p>

          {kbs.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-lg py-6 text-center">
              <p className="text-sm text-gray-400">Sin bases configuradas</p>
            </div>
          ) : (
            <div className="space-y-2">
              {kbs.map((kb, i) => {
                const kbId = kb._id?.toString();
                const isSyncing = kbId && syncingKbs.has(kbId);
                const isExpanded = expandedKbs.has(i);
                return (
                  <div key={kbId || `new-${i}`}
                    className={`border rounded-lg transition-colors ${kb.enabled ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-70'}`}>
                    <div className="flex items-center gap-2 p-3">
                      <button type="button" onClick={() => updateKb(i, 'enabled', !kb.enabled)}
                        className={`flex-shrink-0 w-9 h-5 rounded-full transition-colors relative ${kb.enabled ? 'bg-primary-500' : 'bg-gray-300'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${kb.enabled ? 'translate-x-4' : ''}`} />
                      </button>
                      <input className="flex-1 text-sm font-medium text-gray-800 bg-transparent border-none outline-none"
                        placeholder="Nombre (ej: Menú, Precios…)" value={kb.name}
                        onChange={e => updateKb(i, 'name', e.target.value)} />
                      {kbId && <KbStatusBadge status={kb.status} lastFetched={kb.lastFetched} lastError={kb.lastError} />}
                      {kb.content && <span className="text-xs text-gray-400 hidden sm:block">{kb.content.length.toLocaleString()} ch</span>}
                      {kbId && (
                        <button type="button" onClick={() => handleSyncOne(kbId, i)} disabled={isSyncing || !kb.sourceUrl}
                          className="text-gray-400 hover:text-primary-600 transition-colors">
                          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-primary-500' : ''}`} />
                        </button>
                      )}
                      <button type="button" onClick={() => toggleExpand(i)} className="text-gray-400 hover:text-gray-600">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <button type="button" onClick={() => removeKb(i)} className="text-gray-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-2 border-t border-gray-100 space-y-2">
                        <input className="input text-sm font-mono" placeholder="https://docs.google.com/..."
                          value={kb.sourceUrl} onChange={e => updateKb(i, 'sourceUrl', e.target.value)} />
                        <select className="input text-sm w-44" value={kb.refreshIntervalMinutes}
                          onChange={e => updateKb(i, 'refreshIntervalMinutes', Number(e.target.value))}>
                          {KB_INTERVALS.map(iv => <option key={iv.value} value={iv.value}>{iv.label}</option>)}
                        </select>
                        {kb.status === 'error' && kb.lastError && (
                          <p className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded">{kb.lastError}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Save ──────────────────────────────────────────────── */}
        <div className="flex justify-end gap-3 pb-6">
          <button onClick={() => navigate('/bots')} className="btn-secondary">Cancelar</button>
          <button onClick={handleSave} disabled={saveBot.loading}
            className="btn-primary flex items-center gap-2 px-8">
            <Save className="w-4 h-4" />
            {saveBot.loading ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
