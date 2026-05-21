import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, RefreshCw, CheckCircle, AlertTriangle, Clock, Database, ChevronDown, ChevronUp } from 'lucide-react';
import { botsApi, templatesApi } from '../lib/api.js';
import { useAsyncFn } from '../hooks/useApi.js';
import { PageLoader } from '../components/LoadingSpinner.jsx';
import Alert from '../components/Alert.jsx';

const RUBRICS = [
  { value: 'restaurante', label: 'Restaurante' },
  { value: 'clinica',     label: 'Clínica' },
  { value: 'ecommerce',   label: 'E-commerce' },
  { value: 'servicios',   label: 'Servicios' },
  { value: 'otro',        label: 'Otro' },
];

const DEFAULT_FORM = { name: '', twilioNumber: '', rubric: '', systemPrompt: '', plan: 'basic', active: true };

const KB_INTERVALS = [
  { value: 1,  label: 'Cada 1 minuto'  },
  { value: 5,  label: 'Cada 5 minutos' },
  { value: 10, label: 'Cada 10 minutos'},
  { value: 30, label: 'Cada 30 minutos'},
  { value: 60, label: 'Cada hora'      },
];

function newKb() {
  return { _isNew: true, name: '', enabled: true, sourceUrl: '', refreshIntervalMinutes: 1, status: 'idle', lastFetched: null, lastError: '', content: '' };
}

function KbStatusBadge({ status, lastFetched, lastError }) {
  if (status === 'ok') return (
    <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
      <CheckCircle className="w-3 h-3" />
      {lastFetched ? new Date(lastFetched).toLocaleTimeString('es-AR') : 'Sincronizado'}
    </span>
  );
  if (status === 'error') return (
    <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium" title={lastError}>
      <AlertTriangle className="w-3 h-3" /> Error
    </span>
  );
  return <span className="inline-flex items-center gap-1 text-xs text-gray-400"><Clock className="w-3 h-3" /> Pendiente</span>;
}

export default function BotForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id && id !== 'new');

  const [form, setForm]           = useState(DEFAULT_FORM);
  const [faqs, setFaqs]           = useState([{ question: '', answer: '' }]);
  const [csvText, setCsvText]     = useState('');
  const [faqMode, setFaqMode]     = useState('form');
  const [templates, setTemplates] = useState({});
  const [loadingPage, setLoadingPage] = useState(isEdit);
  const [errors, setErrors]       = useState({});
  const [successMsg, setSuccessMsg] = useState('');

  // Multi-KB state
  const [kbs, setKbs]             = useState([]);
  const [expandedKbs, setExpandedKbs] = useState(new Set());
  const [syncingKbs, setSyncingKbs]   = useState(new Set());
  const [kbMsg, setKbMsg]         = useState('');

  const saveBot = useAsyncFn(isEdit ? data => botsApi.update(id, data) : botsApi.create);

  useEffect(() => {
    templatesApi.list().then(list => {
      const map = {};
      list.forEach(t => { map[t.rubric] = t.systemPrompt; });
      setTemplates(map);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    botsApi.get(id).then(bot => {
      setForm({ name: bot.name, twilioNumber: bot.twilioNumber, rubric: bot.rubric,
        systemPrompt: bot.systemPrompt, plan: bot.plan, active: bot.active });
      if (bot.faqs?.length) setFaqs(bot.faqs);
      setKbs(bot.knowledgeBases ?? []);
      // Auto-expand all existing KBs
      setExpandedKbs(new Set((bot.knowledgeBases ?? []).map((_, i) => i)));
    }).catch(() => navigate('/bots')).finally(() => setLoadingPage(false));
  }, [id, isEdit, navigate]);

  const setField = (key, value) => { setForm(f => ({ ...f, [key]: value })); setErrors(e => ({ ...e, [key]: '' })); };
  const handleRubricChange = e => {
    const rubric = e.target.value;
    setField('rubric', rubric);
    if (templates[rubric] && !form.systemPrompt) setField('systemPrompt', templates[rubric]);
  };

  // KB helpers
  const addKb = () => {
    const idx = kbs.length;
    setKbs(k => [...k, newKb()]);
    setExpandedKbs(s => new Set([...s, idx]));
  };
  const removeKb = i => {
    setKbs(k => k.filter((_, idx) => idx !== i));
    setExpandedKbs(s => { const n = new Set(); s.forEach(v => { if (v < i) n.add(v); else if (v > i) n.add(v - 1); }); return n; });
  };
  const updateKb = (i, key, val) => setKbs(k => k.map((kb, idx) => idx === i ? { ...kb, [key]: val } : kb));
  const toggleExpand = i => setExpandedKbs(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const handleSyncOne = async (kbId, i) => {
    setSyncingKbs(s => new Set([...s, kbId]));
    try {
      const updated = await botsApi.syncOneKb(id, kbId);
      setKbs(updated);
      setKbMsg('Sincronizado correctamente');
      setTimeout(() => setKbMsg(''), 2500);
    } catch (err) {
      setKbMsg(`Error: ${err.message}`);
    } finally {
      setSyncingKbs(s => { const n = new Set(s); n.delete(kbId); return n; });
    }
  };

  const handleSyncAll = async () => {
    setSyncingKbs(new Set(['all']));
    try {
      const updated = await botsApi.syncAllKbs(id);
      setKbs(updated);
      setKbMsg('Todas las bases sincronizadas');
      setTimeout(() => setKbMsg(''), 2500);
    } catch (err) {
      setKbMsg(`Error: ${err.message}`);
    } finally {
      setSyncingKbs(new Set());
    }
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'El nombre es requerido';
    if (!form.twilioNumber.trim()) e.twilioNumber = 'El número Twilio es requerido';
    if (!form.rubric) e.rubric = 'Selecciona un rubro';
    if (!form.systemPrompt.trim()) e.systemPrompt = 'El system prompt es requerido';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!validate()) return;
    try {
      const payload = {
        ...form,
        knowledgeBases: kbs.map(({ _isNew, ...kb }) => kb),
      };
      const saved = await saveBot.execute(payload);
      const botId = saved._id;

      const validFaqs = faqMode === 'form'
        ? faqs.filter(f => f.question?.trim() && f.answer?.trim())
        : csvText.trim().split('\n').map(line => {
            const [q, ...rest] = line.split(',');
            return { question: q?.trim(), answer: rest.join(',').trim() };
          }).filter(f => f.question && f.answer);

      if (validFaqs.length > 0 || isEdit) await botsApi.uploadFaqs(botId, validFaqs);

      setSuccessMsg(isEdit ? 'Bot actualizado correctamente' : 'Bot creado correctamente');
      setTimeout(() => navigate('/bots'), 1200);
    } catch {}
  };

  const addFaq    = () => setFaqs(f => [...f, { question: '', answer: '' }]);
  const removeFaq = i => setFaqs(f => f.filter((_, idx) => idx !== i));
  const updateFaq = (i, key, val) => setFaqs(f => f.map((faq, idx) => idx === i ? { ...faq, [key]: val } : faq));

  if (loadingPage) return <PageLoader />;

  const isSyncingAll = syncingKbs.has('all');
  const hasKbsWithId = kbs.some(kb => kb._id);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/bots')} className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Editar Bot' : 'Nuevo Bot'}</h1>
          <p className="text-gray-500 text-sm mt-0.5">{isEdit ? 'Modifica la configuración del bot' : 'Configura tu nuevo bot de WhatsApp'}</p>
        </div>
      </div>

      {successMsg && <Alert type="success" message={successMsg} className="mb-4" />}
      {saveBot.error && <Alert type="error" message={saveBot.error} onClose={saveBot.clearError} className="mb-4" />}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Información básica</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Nombre del bot *</label>
              <input className={`input ${errors.name ? 'border-red-400' : ''}`} placeholder="Ej: Bot Restaurante El Fogón"
                value={form.name} onChange={e => setField('name', e.target.value)} />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="label">Número Twilio *</label>
              <input className={`input ${errors.twilioNumber ? 'border-red-400' : ''}`} placeholder="whatsapp:+14155238886"
                value={form.twilioNumber} onChange={e => setField('twilioNumber', e.target.value)} />
              {errors.twilioNumber && <p className="text-red-500 text-xs mt-1">{errors.twilioNumber}</p>}
            </div>
            <div>
              <label className="label">Rubro *</label>
              <select className={`input ${errors.rubric ? 'border-red-400' : ''}`} value={form.rubric} onChange={handleRubricChange}>
                <option value="">Seleccionar rubro...</option>
                {RUBRICS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {errors.rubric && <p className="text-red-500 text-xs mt-1">{errors.rubric}</p>}
            </div>
            <div>
              <label className="label">Plan</label>
              <select className="input" value={form.plan} onChange={e => setField('plan', e.target.value)}>
                <option value="basic">Básico (100 msg/mes)</option>
                <option value="pro">Pro (500 msg/mes)</option>
                <option value="enterprise">Enterprise (ilimitado)</option>
              </select>
            </div>
          </div>
        </div>

        {/* System Prompt */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Personalidad / System Prompt</h2>
            {form.rubric && templates[form.rubric] && (
              <button type="button" onClick={() => setField('systemPrompt', templates[form.rubric])}
                className="text-xs text-primary-500 hover:text-primary-700 font-medium">
                Cargar template del rubro
              </button>
            )}
          </div>
          <textarea className={`input h-48 resize-none font-mono text-sm ${errors.systemPrompt ? 'border-red-400' : ''}`}
            placeholder="Describe cómo debe comportarse el bot, su tono, qué puede y no puede hacer..."
            value={form.systemPrompt} onChange={e => setField('systemPrompt', e.target.value)} />
          {errors.systemPrompt && <p className="text-red-500 text-xs mt-1">{errors.systemPrompt}</p>}
          <p className="text-xs text-gray-400 mt-2">{form.systemPrompt.length} caracteres</p>
        </div>

        {/* FAQs */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Preguntas Frecuentes (FAQs)</h2>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {['form','csv'].map(m => (
                <button key={m} type="button" onClick={() => setFaqMode(m)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${faqMode === m ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {m === 'form' ? 'Formulario' : 'CSV'}
                </button>
              ))}
            </div>
          </div>
          {faqMode === 'form' ? (
            <div className="space-y-3">
              {faqs.map((faq, i) => (
                <div key={i} className="flex gap-3 items-start">
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
              <button type="button" onClick={addFaq} className="flex items-center gap-2 text-sm text-primary-500 hover:text-primary-700 font-medium">
                <Plus className="w-4 h-4" /> Agregar FAQ
              </button>
            </div>
          ) : (
            <div>
              <textarea className="input h-40 resize-none font-mono text-sm"
                placeholder={'pregunta,respuesta\n¿Cuáles son los horarios?,Abrimos de lunes a viernes de 9 a 18hs'}
                value={csvText} onChange={e => setCsvText(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Formato: pregunta,respuesta (una por línea)</p>
            </div>
          )}
        </div>

        {/* Knowledge Bases */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-primary-500" />
              <h2 className="text-base font-semibold text-gray-900">Bases de conocimiento dinámicas</h2>
              {kbs.length > 0 && (
                <span className="text-xs bg-primary-100 text-primary-600 font-semibold px-2 py-0.5 rounded-full">{kbs.length}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isEdit && hasKbsWithId && (
                <button type="button" onClick={handleSyncAll} disabled={isSyncingAll}
                  className="btn-secondary text-xs py-1.5 flex items-center gap-1">
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
                  Sync todas
                </button>
              )}
              <button type="button" onClick={addKb} disabled={kbs.length >= 10}
                className="btn-primary text-xs py-1.5 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Agregar
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-500 mb-4">
            Vinculá el bot a múltiples documentos en la nube (Google Docs, Sheets, SharePoint, OneDrive o cualquier URL pública).
            Cada base se inyecta al system prompt y se actualiza automáticamente.
          </p>

          {kbMsg && <p className={`text-xs font-medium mb-3 ${kbMsg.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>{kbMsg}</p>}

          {kbs.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-lg py-8 text-center">
              <Database className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Sin bases configuradas</p>
              <button type="button" onClick={addKb} className="mt-3 text-xs text-primary-500 hover:text-primary-700 font-medium">
                + Agregar primera base
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {kbs.map((kb, i) => {
                const isExpanded = expandedKbs.has(i);
                const kbId = kb._id?.toString();
                const isSyncing = kbId ? syncingKbs.has(kbId) : false;

                return (
                  <div key={kbId || `new-${i}`}
                    className={`border rounded-lg transition-colors ${kb.enabled ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-70'}`}>
                    {/* Header row */}
                    <div className="flex items-center gap-3 p-3">
                      {/* Toggle */}
                      <button type="button"
                        onClick={() => updateKb(i, 'enabled', !kb.enabled)}
                        className={`flex-shrink-0 w-9 h-5 rounded-full transition-colors relative ${kb.enabled ? 'bg-primary-500' : 'bg-gray-300'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${kb.enabled ? 'translate-x-4' : ''}`} />
                      </button>

                      {/* Name (inline edit) */}
                      <input
                        className="flex-1 text-sm font-medium text-gray-800 bg-transparent border-none outline-none focus:ring-1 focus:ring-primary-300 rounded px-1 -mx-1"
                        placeholder="Nombre (ej: Menú, Precios, Stock…)"
                        value={kb.name}
                        onChange={e => updateKb(i, 'name', e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />

                      {/* Status badge */}
                      {isEdit && kbId && <KbStatusBadge status={kb.status} lastFetched={kb.lastFetched} lastError={kb.lastError} />}

                      {/* Chars */}
                      {kb.content && (
                        <span className="text-xs text-gray-400 hidden sm:block flex-shrink-0">
                          {kb.content.length.toLocaleString()} chars
                        </span>
                      )}

                      {/* Sync one */}
                      {isEdit && kbId && (
                        <button type="button" onClick={() => handleSyncOne(kbId, i)} disabled={isSyncing || !kb.sourceUrl}
                          className="text-gray-400 hover:text-primary-600 transition-colors flex-shrink-0" title="Sincronizar ahora">
                          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-primary-500' : ''}`} />
                        </button>
                      )}

                      {/* Expand / collapse */}
                      <button type="button" onClick={() => toggleExpand(i)}
                        className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {/* Delete */}
                      <button type="button" onClick={() => removeKb(i)}
                        className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Expanded body */}
                    {isExpanded && (
                      <div className="px-3 pb-3 space-y-3 border-t border-gray-100 pt-3">
                        <div>
                          <label className="label">URL del documento</label>
                          <input className="input text-sm font-mono"
                            placeholder="https://docs.google.com/document/d/... o cualquier URL pública"
                            value={kb.sourceUrl}
                            onChange={e => updateKb(i, 'sourceUrl', e.target.value)} />
                          <p className="text-xs text-gray-400 mt-1">
                            Compatible con Google Docs, Google Sheets, Google Drive, SharePoint, OneDrive y URLs con texto plano o CSV.
                          </p>
                        </div>
                        <div>
                          <label className="label">Intervalo de actualización</label>
                          <select className="input text-sm w-48" value={kb.refreshIntervalMinutes}
                            onChange={e => updateKb(i, 'refreshIntervalMinutes', Number(e.target.value))}>
                            {KB_INTERVALS.map(iv => <option key={iv.value} value={iv.value}>{iv.label}</option>)}
                          </select>
                        </div>
                        {isEdit && kb.lastError && kb.status === 'error' && (
                          <p className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded">⚠ {kb.lastError}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pb-6">
          <button type="button" onClick={() => navigate('/bots')} className="btn-secondary">Cancelar</button>
          <button type="submit" className="btn-primary px-8" disabled={saveBot.loading}>
            {saveBot.loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear bot'}
          </button>
        </div>
      </form>
    </div>
  );
}
