import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Bot, Trash2, Settings, Pause, Play } from 'lucide-react';
import { botsApi } from '../lib/api.js';
import { useApi, useAsyncFn } from '../hooks/useApi.js';
import { PageLoader } from '../components/LoadingSpinner.jsx';
import Alert from '../components/Alert.jsx';

const PLAN_BADGE = {
  basic:      'bg-gray-100 text-gray-600',
  pro:        'bg-blue-100 text-blue-700',
  enterprise: 'bg-purple-100 text-purple-700',
};
const PLAN_LABELS = { basic: 'Básico', pro: 'Pro', enterprise: 'Enterprise' };
const PLAN_LIMIT  = { basic: 100, pro: 500, enterprise: Infinity };

function formatPhone(raw) {
  if (!raw) return null;
  if (/^549\d{10}$/.test(raw)) {
    return `+54 9 ${raw.slice(3, 5)} ${raw.slice(5, 9)}-${raw.slice(9)}`;
  }
  return raw;
}

function StatusBadge({ status }) {
  const isActive = status === 'active';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
      isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-400'}`} />
      {isActive ? 'Activo' : 'Pausado'}
    </span>
  );
}

export default function BotList() {
  const navigate = useNavigate();
  const { data: bots, loading, error, refetch } = useApi(botsApi.list);
  const deleteBot = useAsyncFn(botsApi.delete);
  const [toast, setToast] = useState('');
  const [actionError, setActionError] = useState('');
  const [loadingIds, setLoadingIds] = useState(new Set());

  const markLoading = id => setLoadingIds(s => new Set([...s, id]));
  const unmarkLoading = id => setLoadingIds(s => { const n = new Set(s); n.delete(id); return n; });

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const handlePause = async bot => {
    markLoading(bot._id);
    try {
      await botsApi.pause(bot._id);
      refetch();
      showToast(`Bot "${bot.name}" pausado`);
    } catch (e) { setActionError(e.message); } finally { unmarkLoading(bot._id); }
  };

  const handleResume = async bot => {
    markLoading(bot._id);
    try {
      await botsApi.resume(bot._id);
      refetch();
      showToast(`Bot "${bot.name}" reanudado`);
    } catch (e) { setActionError(e.message); } finally { unmarkLoading(bot._id); }
  };

  const handleDelete = async bot => {
    if (!window.confirm(`¿Eliminar el bot "${bot.name}"? Esta acción no se puede deshacer.`)) return;
    markLoading(bot._id);
    try {
      await deleteBot.execute(bot._id);
      refetch();
      showToast('Bot eliminado');
    } catch (e) { setActionError(e.message); } finally { unmarkLoading(bot._id); }
  };

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis Bots</h1>
          <p className="text-gray-500 text-sm mt-1">{bots?.length ?? 0} bots registrados</p>
        </div>
        <button onClick={() => navigate('/bots/new')} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nuevo Bot
        </button>
      </div>

      {toast && (
        <div className="mb-4 px-4 py-2.5 bg-gray-900 text-white text-sm rounded-lg inline-flex items-center gap-2 shadow-lg">
          {toast}
        </div>
      )}
      {(error || actionError) && (
        <Alert type="error" message={error || actionError} onClose={() => setActionError('')} className="mb-4" />
      )}

      {(!bots || bots.length === 0) ? (
        <div className="card text-center py-16">
          <Bot className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No tenés bots todavía</h3>
          <p className="text-gray-500 text-sm mb-6">Creá tu primer bot de WhatsApp con IA</p>
          <button onClick={() => navigate('/bots/new')} className="btn-primary">Crear primer bot</button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Nombre', 'Número de teléfono', 'Estado', 'Mensajes usados', 'Plan', 'Acciones'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bots.map(bot => {
                  const limit = PLAN_LIMIT[bot.plan] ?? 100;
                  const pct = limit === Infinity ? 0 : Math.min(100, ((bot.messageCount ?? 0) / limit) * 100);
                  const isLoading = loadingIds.has(bot._id);
                  const phone = formatPhone(bot.phoneNumber);

                  return (
                    <tr key={bot._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Bot className="w-3.5 h-3.5 text-primary-500" />
                          </div>
                          <span className="font-medium text-gray-900">{bot.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {phone ? (
                          <span className="text-green-700 font-mono text-xs">{phone}</span>
                        ) : (
                          <span className="text-gray-400 text-xs italic">Sin asignar</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={bot.status ?? 'active'} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="min-w-[120px]">
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>{bot.messageCount ?? 0}</span>
                            <span>{limit === Infinity ? '∞' : limit}</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            {limit === Infinity ? (
                              <div className="h-full w-full bg-purple-300 rounded-full" />
                            ) : (
                              <div className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-primary-500'}`}
                                style={{ width: `${pct}%` }} />
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PLAN_BADGE[bot.plan] ?? 'bg-gray-100 text-gray-600'}`}>
                          {PLAN_LABELS[bot.plan] ?? bot.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {/* Configure */}
                          <button onClick={() => navigate(`/bots/${bot._id}/configure`)} title="Configurar"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100 text-xs font-medium transition-colors">
                            <Settings className="w-3.5 h-3.5" /> Configurar
                          </button>

                          {/* Pause / Resume */}
                          {(bot.status ?? 'active') === 'active' ? (
                            <button onClick={() => handlePause(bot)} disabled={isLoading} title="Pausar"
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-xs font-medium transition-colors disabled:opacity-50">
                              <Pause className="w-3.5 h-3.5" /> Pausar
                            </button>
                          ) : (
                            <button onClick={() => handleResume(bot)} disabled={isLoading} title="Reanudar"
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 text-xs font-medium transition-colors disabled:opacity-50">
                              <Play className="w-3.5 h-3.5" /> Reanudar
                            </button>
                          )}

                          {/* Delete */}
                          <button onClick={() => handleDelete(bot)} disabled={isLoading} title="Eliminar"
                            className="p-1.5 rounded-lg bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
