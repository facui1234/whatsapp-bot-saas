import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Upload } from 'lucide-react';
import { botsApi, templatesApi } from '../lib/api.js';
import { useAsyncFn } from '../hooks/useApi.js';
import { PageLoader } from '../components/LoadingSpinner.jsx';
import Alert from '../components/Alert.jsx';

const RUBRICS = [
  { value: 'restaurante', label: 'Restaurante' },
  { value: 'clinica', label: 'Clínica' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'otro', label: 'Otro' },
];

const DEFAULT_FORM = {
  name: '', twilioNumber: '', rubric: '', systemPrompt: '', plan: 'basic', active: true,
};

export default function BotForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id && id !== 'new');

  const [form, setForm] = useState(DEFAULT_FORM);
  const [faqs, setFaqs] = useState([{ question: '', answer: '' }]);
  const [csvText, setCsvText] = useState('');
  const [faqMode, setFaqMode] = useState('form');
  const [templates, setTemplates] = useState({});
  const [loadingPage, setLoadingPage] = useState(isEdit);
  const [errors, setErrors] = useState({});
  const [successMsg, setSuccessMsg] = useState('');

  const saveBot = useAsyncFn(isEdit ? data => botsApi.update(id, data) : botsApi.create);
  const saveFaqs = useAsyncFn(data => botsApi.uploadFaqs(isEdit ? id : null, data));

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
      setForm({
        name: bot.name, twilioNumber: bot.twilioNumber, rubric: bot.rubric,
        systemPrompt: bot.systemPrompt, plan: bot.plan, active: bot.active,
      });
      if (bot.faqs?.length) setFaqs(bot.faqs.length ? bot.faqs : [{ question: '', answer: '' }]);
    }).catch(() => navigate('/bots')).finally(() => setLoadingPage(false));
  }, [id, isEdit, navigate]);

  const setField = (key, value) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: '' }));
  };

  const handleRubricChange = e => {
    const rubric = e.target.value;
    setField('rubric', rubric);
    if (templates[rubric] && !form.systemPrompt) {
      setField('systemPrompt', templates[rubric]);
    }
  };

  const loadTemplate = () => {
    if (templates[form.rubric]) setField('systemPrompt', templates[form.rubric]);
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
      const saved = await saveBot.execute(form);
      const botId = saved._id;

      // Save FAQs if any
      const validFaqs = faqMode === 'form'
        ? faqs.filter(f => f.question.trim() && f.answer.trim())
        : [];
      const csvFaqs = faqMode === 'csv' && csvText.trim()
        ? csvText.trim().split('\n').map(line => {
            const [q, ...rest] = line.split(',');
            return { question: q?.trim(), answer: rest.join(',').trim() };
          }).filter(f => f.question && f.answer)
        : [];
      const allFaqs = faqMode === 'form' ? validFaqs : csvFaqs;

      if (allFaqs.length > 0 || isEdit) {
        await botsApi.uploadFaqs(botId, allFaqs);
      }

      setSuccessMsg(isEdit ? 'Bot actualizado correctamente' : 'Bot creado correctamente');
      setTimeout(() => navigate('/bots'), 1200);
    } catch (err) {
      // error shown via saveBot.error
    }
  };

  const addFaq = () => setFaqs(f => [...f, { question: '', answer: '' }]);
  const removeFaq = i => setFaqs(f => f.filter((_, idx) => idx !== i));
  const updateFaq = (i, key, val) => setFaqs(f => f.map((faq, idx) => idx === i ? { ...faq, [key]: val } : faq));

  if (loadingPage) return <PageLoader />;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/bots')} className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Editar Bot' : 'Nuevo Bot'}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {isEdit ? 'Modifica la configuración del bot' : 'Configura tu nuevo bot de WhatsApp'}
          </p>
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
              <input
                className={`input ${errors.name ? 'border-red-400' : ''}`}
                placeholder="Ej: Bot Restaurante El Fogón"
                value={form.name}
                onChange={e => setField('name', e.target.value)}
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="label">Número Twilio *</label>
              <input
                className={`input ${errors.twilioNumber ? 'border-red-400' : ''}`}
                placeholder="whatsapp:+14155238886"
                value={form.twilioNumber}
                onChange={e => setField('twilioNumber', e.target.value)}
              />
              {errors.twilioNumber && <p className="text-red-500 text-xs mt-1">{errors.twilioNumber}</p>}
            </div>
            <div>
              <label className="label">Rubro *</label>
              <select
                className={`input ${errors.rubric ? 'border-red-400' : ''}`}
                value={form.rubric}
                onChange={handleRubricChange}
              >
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
              <button type="button" onClick={loadTemplate} className="text-xs text-primary-500 hover:text-primary-700 font-medium">
                Cargar template del rubro
              </button>
            )}
          </div>
          <textarea
            className={`input h-48 resize-none font-mono text-sm ${errors.systemPrompt ? 'border-red-400' : ''}`}
            placeholder="Describe cómo debe comportarse el bot, su tono, qué puede y no puede hacer..."
            value={form.systemPrompt}
            onChange={e => setField('systemPrompt', e.target.value)}
          />
          {errors.systemPrompt && <p className="text-red-500 text-xs mt-1">{errors.systemPrompt}</p>}
          <p className="text-xs text-gray-400 mt-2">
            {form.systemPrompt.length} caracteres · Las FAQs se agregan automáticamente al final
          </p>
        </div>

        {/* FAQs */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Preguntas Frecuentes (FAQs)</h2>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setFaqMode('form')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${faqMode === 'form' ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                Formulario
              </button>
              <button
                type="button"
                onClick={() => setFaqMode('csv')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${faqMode === 'csv' ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                CSV
              </button>
            </div>
          </div>

          {faqMode === 'form' && (
            <div className="space-y-3">
              {faqs.map((faq, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <input
                      className="input text-sm"
                      placeholder="Pregunta"
                      value={faq.question}
                      onChange={e => updateFaq(i, 'question', e.target.value)}
                    />
                    <input
                      className="input text-sm"
                      placeholder="Respuesta"
                      value={faq.answer}
                      onChange={e => updateFaq(i, 'answer', e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFaq(i)}
                    className="text-gray-400 hover:text-red-500 transition-colors pt-2"
                    disabled={faqs.length === 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={addFaq} className="flex items-center gap-2 text-sm text-primary-500 hover:text-primary-700 font-medium">
                <Plus className="w-4 h-4" />
                Agregar FAQ
              </button>
            </div>
          )}

          {faqMode === 'csv' && (
            <div>
              <textarea
                className="input h-40 resize-none font-mono text-sm"
                placeholder={'pregunta,respuesta\n¿Cuáles son los horarios?,Abrimos de lunes a viernes de 9 a 18hs\n¿Hacen envíos?,Sí, enviamos a todo el país'}
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Formato: pregunta,respuesta (una por línea)</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pb-6">
          <button type="button" onClick={() => navigate('/bots')} className="btn-secondary">
            Cancelar
          </button>
          <button type="submit" className="btn-primary px-8" disabled={saveBot.loading}>
            {saveBot.loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear bot'}
          </button>
        </div>
      </form>
    </div>
  );
}
