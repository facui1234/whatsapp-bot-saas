import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { clientsApi } from '../lib/api.js';
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

const DEFAULT = { name: '', email: '', phone: '', rubric: '', plan: 'basic', monthlyBudget: '', status: 'active', notes: '' };

export default function ClientForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id && id !== 'new');

  const [form, setForm] = useState(DEFAULT);
  const [errors, setErrors] = useState({});
  const [loadingPage, setLoadingPage] = useState(isEdit);
  const [success, setSuccess] = useState('');

  const saveClient = useAsyncFn(isEdit ? data => clientsApi.update(id, data) : clientsApi.create);

  useEffect(() => {
    if (!isEdit) return;
    clientsApi.get(id)
      .then(c => setForm({ name: c.name, email: c.email, phone: c.phone ?? '', rubric: c.rubric, plan: c.plan, monthlyBudget: c.monthlyBudget ?? '', status: c.status, notes: c.notes ?? '' }))
      .catch(() => navigate('/clients'))
      .finally(() => setLoadingPage(false));
  }, [id, isEdit, navigate]);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };

  const validate = () => {
    const e = {};
    if (!form.name.trim() || form.name.trim().length < 3) e.name = 'Mínimo 3 caracteres';
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Email inválido';
    if (!form.rubric) e.rubric = 'Seleccioná un rubro';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!validate()) return;
    try {
      await saveClient.execute({ ...form, monthlyBudget: Number(form.monthlyBudget) || 0 });
      setSuccess(isEdit ? 'Cliente actualizado' : 'Cliente creado');
      setTimeout(() => navigate('/clients'), 1000);
    } catch {}
  };

  if (loadingPage) return <PageLoader />;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/clients')} className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Editar Cliente' : 'Nuevo Cliente'}</h1>
          <p className="text-gray-500 text-sm mt-0.5">Datos de la empresa / contacto</p>
        </div>
      </div>

      {success && <Alert type="success" message={success} className="mb-4" />}
      {saveClient.error && <Alert type="error" message={saveClient.error} onClose={saveClient.clearError} className="mb-4" />}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Datos del cliente</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Nombre / Empresa *</label>
              <input className={`input ${errors.name ? 'border-red-400' : ''}`} placeholder="Ej: Restaurante El Fogón"
                value={form.name} onChange={e => set('name', e.target.value)} />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="label">Email *</label>
              <input type="email" className={`input ${errors.email ? 'border-red-400' : ''}`} placeholder="contacto@empresa.com"
                value={form.email} onChange={e => set('email', e.target.value)} />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>
            <div>
              <label className="label">Teléfono</label>
              <input className="input" placeholder="+54 11 1234-5678"
                value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
            <div>
              <label className="label">Rubro *</label>
              <select className={`input ${errors.rubric ? 'border-red-400' : ''}`}
                value={form.rubric} onChange={e => set('rubric', e.target.value)}>
                <option value="">Seleccionar...</option>
                {RUBRICS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {errors.rubric && <p className="text-red-500 text-xs mt-1">{errors.rubric}</p>}
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Plan y facturación</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Plan</label>
              <select className="input" value={form.plan} onChange={e => set('plan', e.target.value)}>
                <option value="basic">Básico ($59/mes)</option>
                <option value="pro">Pro ($199/mes)</option>
                <option value="enterprise">Enterprise (consultar)</option>
              </select>
            </div>
            <div>
              <label className="label">Presupuesto mensual (USD)</label>
              <input type="number" min="0" className="input" placeholder="200"
                value={form.monthlyBudget} onChange={e => set('monthlyBudget', e.target.value)} />
            </div>
            <div>
              <label className="label">Estado</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Activo</option>
                <option value="paused">Pausado</option>
                <option value="inactive">Inactivo</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Notas internas</h2>
          <textarea className="input h-28 resize-none text-sm" placeholder="Observaciones, acuerdos especiales, contacto adicional..."
            value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <div className="flex gap-3 justify-end pb-6">
          <button type="button" onClick={() => navigate('/clients')} className="btn-secondary">Cancelar</button>
          <button type="submit" className="btn-primary px-8" disabled={saveClient.loading}>
            {saveClient.loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear cliente'}
          </button>
        </div>
      </form>
    </div>
  );
}
