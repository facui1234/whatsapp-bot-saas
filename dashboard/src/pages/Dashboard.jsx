import { useNavigate } from 'react-router-dom';
import { Users, MessageSquare, DollarSign, TrendingUp, ArrowRight, Download } from 'lucide-react';
import { reportsApi, clientsApi } from '../lib/api.js';
import { useApi } from '../hooks/useApi.js';
import { PageLoader } from '../components/LoadingSpinner.jsx';
import Alert from '../components/Alert.jsx';

const fmt$ = n => `$${(n ?? 0).toFixed(2)}`;
const fmtN = n => (n ?? 0).toLocaleString('es-AR');

const PLAN_COLORS = { basic: 'bg-gray-100 text-gray-600', pro: 'bg-blue-100 text-blue-700', enterprise: 'bg-purple-100 text-purple-700' };
const STATUS_COLORS = { active: 'bg-green-100 text-green-700', paused: 'bg-yellow-100 text-yellow-700', inactive: 'bg-gray-100 text-gray-500' };

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600', orange: 'bg-orange-50 text-orange-600',
  };
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: report, loading, error } = useApi(reportsApi.monthly);
  const { data: clientsData } = useApi(clientsApi.list);

  const topClients = report?.clients?.slice(0, 5) ?? [];

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Resumen del mes actual · {report?.month ?? '—'}</p>
        </div>
        <a href="/api/reports/monthly/csv" download className="btn-secondary flex items-center gap-2 text-sm">
          <Download className="w-4 h-4" /> Exportar CSV
        </a>
      </div>

      {error && <Alert type="error" message={error} className="mb-4" />}

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Users} label="Clientes activos" value={report?.activeClients ?? '—'}
          sub={`${report?.totalClients ?? 0} totales`} color="blue" />
        <StatCard icon={DollarSign} label="MRR (cobrado)" value={fmt$(report?.totalCostClient)}
          sub={`Costo real: ${fmt$(report?.totalCostReal)}`} color="green" />
        <StatCard icon={TrendingUp} label="Margen del mes" value={fmt$(report?.totalMargin)}
          sub={report?.totalCostClient > 0 ? `${Math.round((report.totalMargin / report.totalCostClient) * 100)}% de margen` : ''} color="purple" />
        <StatCard icon={MessageSquare} label="Mensajes este mes" value={fmtN(report?.totalMessages)}
          color="orange" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Top clients */}
        <div className="xl:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Top clientes por consumo</h2>
            <button onClick={() => navigate('/clients')} className="text-xs text-primary-500 hover:text-primary-700 flex items-center gap-1">
              Ver todos <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {topClients.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Sin datos este mes</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100">
                  {['Cliente', 'Plan', 'Mensajes', 'Costo real', 'Cobrado', 'Margen'].map(h => (
                    <th key={h} className="pb-2 pr-3 text-xs font-medium text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topClients.map((c, i) => (
                  <tr key={c.clientId} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/clients/${c.clientId}`)}>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {i + 1}
                        </span>
                        <span className="font-medium text-gray-800">{c.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_COLORS[c.plan] ?? 'bg-gray-100 text-gray-600'}`}>{c.plan}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-gray-600">{fmtN(c.messages)}</td>
                    <td className="py-2.5 pr-3 text-gray-600">{fmt$(c.costReal)}</td>
                    <td className="py-2.5 pr-3 font-medium text-gray-900">{fmt$(c.costClient)}</td>
                    <td className="py-2.5 text-green-600 font-medium">{fmt$(c.costClient - c.costReal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Quick summary */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3">Resumen financiero</h3>
            <div className="space-y-3">
              {[
                { label: 'Costo Anthropic (real)', value: fmt$(report?.totalCostReal), color: 'text-red-600' },
                { label: 'Ingresos clientes (3x)', value: fmt$(report?.totalCostClient), color: 'text-green-600' },
                { label: 'Margen bruto', value: fmt$(report?.totalMargin), color: 'text-primary-600 font-bold' },
                { label: 'Tokens procesados', value: fmtN(report?.totalTokens), color: 'text-gray-700' },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">{row.label}</span>
                  <span className={`text-sm ${row.color}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3">Acciones rápidas</h3>
            <div className="space-y-2">
              <button onClick={() => navigate('/clients/new')}
                className="w-full btn-primary text-sm py-2">
                + Nuevo cliente
              </button>
              <button onClick={() => navigate('/invoices')}
                className="w-full btn-secondary text-sm py-2">
                Ver facturas
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
