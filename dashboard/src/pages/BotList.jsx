import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Bot, Pencil, Trash2, MessageSquare, Power, PowerOff } from 'lucide-react';
import { botsApi } from '../lib/api.js';
import { useApi, useAsyncFn } from '../hooks/useApi.js';
import { PageLoader } from '../components/LoadingSpinner.jsx';
import Alert from '../components/Alert.jsx';

const PLAN_LABELS = { basic: 'Básico', pro: 'Pro', enterprise: 'Enterprise' };
const PLAN_COLORS = {
  basic: 'bg-gray-100 text-gray-700',
  pro: 'bg-blue-100 text-blue-700',
  enterprise: 'bg-purple-100 text-purple-700',
};
const RUBRIC_LABELS = {
  restaurante: 'Restaurante', clinica: 'Clínica', ecommerce: 'E-commerce',
  servicios: 'Servicios', otro: 'Otro',
};

function StatusBadge({ active }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
      active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-green-500' : 'bg-gray-400'}`} />
      {active ? 'Activo' : 'Inactivo'}
    </span>
  );
}

function ProgressBar({ value, max }) {
  const isInfinite = max === Infinity || max === -1;
  const pct = isInfinite ? 0 : Math.min(100, (value / max) * 100);
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-primary-500';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{value} usados</span>
        <span>{isInfinite ? '∞' : max} límite</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        {!isInfinite && <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />}
        {isInfinite && <div className="h-full w-full bg-purple-300 rounded-full" />}
      </div>
    </div>
  );
}

export default function BotList() {
  const navigate = useNavigate();
  const { data: bots, loading, error, refetch } = useApi(botsApi.list);
  const deleteBot = useAsyncFn(botsApi.delete);
  const updateBot = useAsyncFn(botsApi.update);
  const [actionError, setActionError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async bot => {
    if (!window.confirm(`¿Eliminar el bot "${bot.name}"? Esta acción no se puede deshacer.`)) return;
    setDeletingId(bot._id);
    try {
      await deleteBot.execute(bot._id);
      refetch();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggle = async bot => {
    try {
      await updateBot.execute(bot._id, { ...bot, active: !bot.active });
      refetch();
    } catch (e) {
      setActionError(e.message);
    }
  };

  const planLimit = plan => plan === 'enterprise' ? Infinity : plan === 'pro' ? 500 : 100;

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis Bots</h1>
          <p className="text-gray-500 text-sm mt-1">Gestiona tus bots de WhatsApp</p>
        </div>
        <button onClick={() => navigate('/bots/new')} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nuevo Bot
        </button>
      </div>

      {(error || actionError) && (
        <Alert type="error" message={error || actionError} onClose={() => setActionError('')} className="mb-4" />
      )}

      {bots?.length === 0 && (
        <div className="card text-center py-16">
          <Bot className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No tienes bots todavía</h3>
          <p className="text-gray-500 text-sm mb-6">Crea tu primer bot de WhatsApp con IA</p>
          <button onClick={() => navigate('/bots/new')} className="btn-primary">
            Crear primer bot
          </button>
        </div>
      )}

      {bots?.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {bots.map(bot => (
            <div key={bot._id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5 text-primary-500" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{bot.name}</h3>
                    <p className="text-xs text-gray-500 truncate">{bot.twilioNumber}</p>
                  </div>
                </div>
                <StatusBadge active={bot.active} />
              </div>

              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-gray-500">{RUBRIC_LABELS[bot.rubric]}</span>
                <span className="text-gray-300">·</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PLAN_COLORS[bot.plan]}`}>
                  {PLAN_LABELS[bot.plan]}
                </span>
              </div>

              <div className="mb-4">
                <ProgressBar value={bot.messageCount} max={planLimit(bot.plan)} />
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                <button
                  onClick={() => navigate(`/bots/${bot._id}/history`)}
                  className="btn-secondary flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Historial
                </button>
                <button
                  onClick={() => navigate(`/bots/${bot._id}/edit`)}
                  className="btn-secondary px-3 py-1.5"
                  title="Editar"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleToggle(bot)}
                  className={`px-3 py-1.5 rounded-lg border transition-colors ${
                    bot.active
                      ? 'border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100'
                      : 'border-green-200 bg-green-50 text-green-600 hover:bg-green-100'
                  }`}
                  title={bot.active ? 'Desactivar' : 'Activar'}
                >
                  {bot.active ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => handleDelete(bot)}
                  disabled={deletingId === bot._id}
                  className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50"
                  title="Eliminar"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
