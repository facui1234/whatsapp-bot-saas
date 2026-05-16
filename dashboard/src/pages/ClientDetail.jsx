import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, FileText, RotateCcw, Bot, Mail, Phone, Building2, DollarSign } from 'lucide-react';
import { clientsApi } from '../lib/api.js';
import { useApi, useAsyncFn } from '../hooks/useApi.js';
import { PageLoader } from '../components/LoadingSpinner.jsx';
import Alert from '../components/Alert.jsx';

const PLAN_LABEL = { basic: 'Básico', pro: 'Pro', enterprise: 'Enterprise' };
const PLAN_BADGE = { basic: 'bg-gray-100 text-gray-600', pro: 'bg-blue-100 text-blue-700', enterprise: 'bg-purple-100 text-purple-700' };
const STATUS_BADGE = { active: 'bg-green-100 text-green-700', paused: 'bg-yellow-100 text-yellow-600', inactive: 'bg-gray-100 text-gray-500' };
const STATUS_LABEL = { active: 'Activo', paused: 'Pausado', inactive: 'Inactivo' };
const fmt$ = n => `$${(n ?? 0).toFixed(2)}`;
const fmtN = n => (n ?? 0).toLocaleString('es-AR');

const COST_PER_TOKEN_REAL = 0.000008;
const MARKUP = 3;
const COST_PER_MSG_TWILIO = 0.005;

function botCost(bot) {
  const real = (bot.tokensUsedThisMonth ?? 0) * COST_PER_TOKEN_REAL + (bot.messageCountThisMonth ?? 0) * COST_PER_MSG_TWILIO;
  return { real, client: real * MARKUP };
}

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const { data: client, loading, error, refetch } = useApi(() => clientsApi.get(id), [id]);
  const { data: bots, loading: botsLoading, refetch: refetchBots } = useApi(() => clientsApi.getBots(id), [id]);

  const generateInvoice = useAsyncFn(clientsApi.generateInvoice);
  const resetMonth = useAsyncFn(clientsApi.resetMonth);

  const handleGenerateInvoice = async () => {
    try {
      await generateInvoice.execute(id);
      setMsg('Factura generada correctamente');
      setTimeout(() => { setMsg(''); navigate('/invoices'); }, 1500);
    } catch (e) { setErr(e.message); }
  };

  const handleResetMonth = async () => {
    if (!window.confirm('¿Resetear contadores del mes actual para todos los bots de este cliente?')) return;
    try {
      const r = await resetMonth.execute(id);
      setMsg(r.message || 'Contadores reseteados');
      refetchBots();
      setTimeout(() => setMsg(''), 3000);
    } catch (e) { setErr(e.message); }
  };

  if (loading) return <PageLoader />;
  if (error) return <Alert type="error" message={error} />;

  const totalReal = (bots ?? []).reduce((s, b) => s + botCost(b).real, 0);
  const totalClient = (bots ?? []).reduce((s, b) => s + botCost(b).client, 0);
  const totalMessages = (bots ?? []).reduce((s, b) => s + (b.messageCountThisMonth ?? 0), 0);
  const budget = client.monthlyBudget ?? 0;
  const budgetPct = budget > 0 ? Math.min(100, Math.round((totalClient / budget) * 100)) : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/clients')} className="text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[client.status]}`}>
                {STATUS_LABEL[client.status]}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-0.5">{client.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/clients/${id}/edit`)} className="btn-secondary flex items-center gap-2 text-sm">
            <Pencil className="w-4 h-4" /> Editar
          </button>
          <button onClick={handleGenerateInvoice} disabled={generateInvoice.loading}
            className="btn-primary flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4" />
            {generateInvoice.loading ? 'Generando...' : 'Generar factura'}
          </button>
        </div>
      </div>

      {msg && <Alert type="success" message={msg} className="mb-4" />}
      {(err || generateInvoice.error) && <Alert type="error" message={err || generateInvoice.error} onClose={() => setErr('')} className="mb-4" />}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="space-y-5">
          {/* Client info */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4">Información</h3>
            <div className="space-y-3">
              {[
                { icon: Mail, label: 'Email', value: client.email },
                { icon: Phone, label: 'Teléfono', value: client.phone || '—' },
                { icon: Building2, label: 'Rubro', value: client.rubric },
              ].map(row => (
                <div key={row.label} className="flex items-start gap-3">
                  <row.icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">{row.label}</p>
                    <p className="text-sm text-gray-800 capitalize">{row.value}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-start gap-3">
                <DollarSign className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Plan</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PLAN_BADGE[client.plan]}`}>
                    {PLAN_LABEL[client.plan]}
                  </span>
                </div>
              </div>
            </div>
            {client.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-1">Notas</p>
                <p className="text-sm text-gray-600">{client.notes}</p>
              </div>
            )}
          </div>

          {/* Cost this month */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3">Consumo este mes</h3>
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Mensajes</span>
                <span className="font-medium">{fmtN(totalMessages)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Costo real (Anthropic)</span>
                <span className="text-red-600">{fmt$(totalReal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Cobrado al cliente (3x)</span>
                <span className="font-bold text-gray-900">{fmt$(totalClient)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tu margen</span>
                <span className="text-green-600 font-medium">{fmt$(totalClient - totalReal)}</span>
              </div>
            </div>
            {budget > 0 && (
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Presupuesto: {fmt$(budget)}/mes</span>
                  <span>{budgetPct}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${budgetPct >= 90 ? 'bg-red-500' : budgetPct >= 70 ? 'bg-yellow-500' : 'bg-primary-500'}`}
                    style={{ width: `${budgetPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3">Acciones</h3>
            <div className="space-y-2">
              <button onClick={() => navigate(`/bots/new?clientId=${id}`)}
                className="w-full btn-secondary text-sm flex items-center gap-2 justify-center">
                <Plus className="w-4 h-4" /> Agregar bot
              </button>
              <button onClick={() => navigate('/invoices')}
                className="w-full btn-secondary text-sm flex items-center gap-2 justify-center">
                <FileText className="w-4 h-4" /> Ver facturas
              </button>
              <button onClick={handleResetMonth} disabled={resetMonth.loading}
                className="w-full text-sm flex items-center gap-2 justify-center px-4 py-2 rounded-lg border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors disabled:opacity-50">
                <RotateCcw className="w-4 h-4" /> Resetear mes
              </button>
            </div>
          </div>
        </div>

        {/* Right column — bots table */}
        <div className="xl:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">
                Bots ({botsLoading ? '…' : (bots?.length ?? 0)})
              </h3>
              <button onClick={() => navigate(`/bots/new?clientId=${id}`)}
                className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Nuevo bot
              </button>
            </div>

            {botsLoading ? <PageLoader /> : (bots?.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Bot className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Este cliente no tiene bots todavía</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Bot', 'Número', 'Msgs mes', 'Tokens mes', 'Costo real', 'Cobrado', 'Estado'].map(h => (
                        <th key={h} className="pb-2 pr-3 text-left text-xs font-medium text-gray-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {bots.map(bot => {
                      const cost = botCost(bot);
                      return (
                        <tr key={bot._id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/bots/${bot._id}/edit`)}>
                          <td className="py-3 pr-3 font-medium text-gray-800">{bot.name}</td>
                          <td className="py-3 pr-3 text-xs font-mono text-gray-500">{bot.twilioNumber}</td>
                          <td className="py-3 pr-3 text-gray-600">{fmtN(bot.messageCountThisMonth)}</td>
                          <td className="py-3 pr-3 text-gray-600">{fmtN(bot.tokensUsedThisMonth)}</td>
                          <td className="py-3 pr-3 text-red-600 text-xs">{fmt$(cost.real)}</td>
                          <td className="py-3 pr-3 font-medium text-gray-900">{fmt$(cost.client)}</td>
                          <td className="py-3">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${bot.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${bot.active ? 'bg-green-500' : 'bg-gray-400'}`} />
                              {bot.active ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-200">
                    <tr className="font-semibold">
                      <td className="pt-3 pr-3 text-gray-700" colSpan={2}>Total</td>
                      <td className="pt-3 pr-3 text-gray-700">{fmtN(totalMessages)}</td>
                      <td className="pt-3 pr-3 text-gray-500 text-xs">{fmtN(bots.reduce((s,b)=>s+(b.tokensUsedThisMonth??0),0))}</td>
                      <td className="pt-3 pr-3 text-red-600">{fmt$(totalReal)}</td>
                      <td className="pt-3 text-gray-900">{fmt$(totalClient)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
