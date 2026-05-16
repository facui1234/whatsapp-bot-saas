import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, CheckCircle, Send, AlertTriangle, RefreshCw } from 'lucide-react';
import { clientsApi, reportsApi } from '../lib/api.js';
import { useApi, useAsyncFn } from '../hooks/useApi.js';
import { PageLoader } from '../components/LoadingSpinner.jsx';
import Alert from '../components/Alert.jsx';

const STATUS_BADGE = {
  draft:   'bg-gray-100 text-gray-600',
  sent:    'bg-blue-100 text-blue-700',
  paid:    'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-600',
};
const STATUS_LABEL = { draft: 'Borrador', sent: 'Enviada', paid: 'Pagada', overdue: 'Vencida' };
const STATUS_ICON  = { draft: FileText, sent: Send, paid: CheckCircle, overdue: AlertTriangle };

const fmt$ = n => `$${(n ?? 0).toFixed(2)}`;
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('es-AR') : '—'; }

function InvoicesTable({ clientId, clientName }) {
  const { data: invoices, loading, refetch } = useApi(() => clientsApi.getInvoices(clientId), [clientId]);
  const updateStatus = useAsyncFn((invId, status) => clientsApi.updateInvoiceStatus(clientId, invId, status));
  const [msg, setMsg] = useState('');

  const handle = async (inv, status) => {
    await updateStatus.execute(inv._id, status);
    setMsg(`Factura marcada como "${STATUS_LABEL[status]}"`);
    refetch();
    setTimeout(() => setMsg(''), 2500);
  };

  if (loading) return <div className="py-4"><PageLoader /></div>;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800">{clientName}</h3>
        {msg && <span className="text-xs text-green-600">{msg}</span>}
      </div>
      {!invoices?.length ? (
        <p className="text-sm text-gray-400 px-1">Sin facturas generadas</p>
      ) : (
        <div className="rounded-lg border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Mes', 'Mensajes', 'Tokens', 'Costo real', 'Cobrado', 'Estado', 'Fecha envío', 'Fecha pago', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 bg-white">
              {invoices.map(inv => {
                const Icon = STATUS_ICON[inv.status] ?? FileText;
                return (
                  <tr key={inv._id}>
                    <td className="px-3 py-2 font-mono text-gray-700">{inv.month}</td>
                    <td className="px-3 py-2 text-gray-600">{(inv.totalMessages ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{(inv.totalTokens ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-red-600 text-xs">{fmt$(inv.totalCostReal)}</td>
                    <td className="px-3 py-2 font-bold text-gray-900">{fmt$(inv.totalCostClient)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[inv.status]}`}>
                        <Icon className="w-3 h-3" />
                        {STATUS_LABEL[inv.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{fmtDate(inv.sentDate)}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{fmtDate(inv.paidDate)}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {inv.status === 'draft' && (
                          <button onClick={() => handle(inv, 'sent')}
                            className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                            Enviar
                          </button>
                        )}
                        {(inv.status === 'sent' || inv.status === 'overdue') && (
                          <button onClick={() => handle(inv, 'paid')}
                            className="text-xs px-2 py-1 rounded bg-green-50 text-green-600 hover:bg-green-100 transition-colors">
                            Marcar pagada
                          </button>
                        )}
                        {inv.status === 'sent' && (
                          <button onClick={() => handle(inv, 'overdue')}
                            className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                            Vencer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Invoices() {
  const navigate = useNavigate();
  const { data: report, loading } = useApi(reportsApi.monthly);
  const generateAll = useAsyncFn(async (clients) => {
    for (const c of clients) await clientsApi.generateInvoice(c.clientId);
  });
  const [msg, setMsg] = useState('');

  const clients = report?.clients ?? [];

  const handleGenerateAll = async () => {
    if (!clients.length) return;
    if (!window.confirm(`¿Generar facturas para los ${clients.length} clientes del mes actual?`)) return;
    try {
      await generateAll.execute(clients);
      setMsg(`Facturas generadas para ${clients.length} clientes`);
      setTimeout(() => setMsg(''), 3000);
    } catch {}
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturación</h1>
          <p className="text-gray-500 text-sm mt-1">Facturas de todos los clientes · mes {report?.month ?? '—'}</p>
        </div>
        <div className="flex gap-2">
          <a href="/api/reports/monthly/csv" download
            className="btn-secondary text-sm flex items-center gap-2">
            Exportar CSV
          </a>
          <button onClick={handleGenerateAll} disabled={generateAll.loading || !clients.length}
            className="btn-primary text-sm flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${generateAll.loading ? 'animate-spin' : ''}`} />
            Generar todas
          </button>
        </div>
      </div>

      {msg && <Alert type="success" message={msg} className="mb-4" />}

      {/* Summary */}
      {report && (
        <div className="card mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-900">{fmt$(report.totalCostClient)}</p>
              <p className="text-xs text-gray-500 mt-1">Total a cobrar este mes</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-500">{fmt$(report.totalCostReal)}</p>
              <p className="text-xs text-gray-500 mt-1">Costo Anthropic real</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{fmt$(report.totalMargin)}</p>
              <p className="text-xs text-gray-500 mt-1">Margen bruto</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{report.activeClients}</p>
              <p className="text-xs text-gray-500 mt-1">Clientes activos</p>
            </div>
          </div>
        </div>
      )}

      {loading ? <PageLoader /> : (
        clients.length === 0 ? (
          <div className="card text-center py-16">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No hay clientes con actividad este mes</p>
            <button onClick={() => navigate('/clients/new')} className="btn-primary mt-4 text-sm">
              Crear primer cliente
            </button>
          </div>
        ) : (
          <div className="card">
            {clients.map(c => (
              <InvoicesTable key={c.clientId} clientId={c.clientId} clientName={c.name} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
