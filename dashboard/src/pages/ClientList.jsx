import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Eye, FileText, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { clientsApi } from '../lib/api.js';
import { useApi, useAsyncFn } from '../hooks/useApi.js';
import { PageLoader } from '../components/LoadingSpinner.jsx';
import Alert from '../components/Alert.jsx';

const PLAN_BADGE = { basic: 'bg-gray-100 text-gray-600', pro: 'bg-blue-100 text-blue-700', enterprise: 'bg-purple-100 text-purple-700' };
const STATUS_BADGE = { active: 'bg-green-100 text-green-700', paused: 'bg-yellow-100 text-yellow-600', inactive: 'bg-gray-100 text-gray-500' };
const STATUS_DOT  = { active: 'bg-green-500', paused: 'bg-yellow-400', inactive: 'bg-gray-400' };
const STATUS_LABEL = { active: 'Activo', paused: 'Pausado', inactive: 'Inactivo' };
const fmt$ = n => `$${(n ?? 0).toFixed(2)}`;

export default function ClientList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);

  const params = { page, limit: 20, ...(search && { search }), ...(filterPlan && { plan: filterPlan }), ...(filterStatus && { status: filterStatus }) };
  const { data, loading, error, refetch } = useApi(() => clientsApi.list(params), [page, search, filterPlan, filterStatus]);

  const deleteClient = useAsyncFn(clientsApi.delete);
  const generateInvoice = useAsyncFn(clientsApi.generateInvoice);
  const [actionMsg, setActionMsg] = useState('');
  const [actionError, setActionError] = useState('');

  const handleDelete = async client => {
    if (!window.confirm(`¿Eliminar al cliente "${client.name}" y todos sus bots?\nEsta acción no se puede deshacer.`)) return;
    try {
      await deleteClient.execute(client._id);
      setActionMsg('Cliente eliminado');
      refetch();
      setTimeout(() => setActionMsg(''), 3000);
    } catch (e) { setActionError(e.message); }
  };

  const handleGenerateInvoice = async client => {
    try {
      await generateInvoice.execute(client._id);
      setActionMsg(`Factura generada para ${client.name}`);
      setTimeout(() => { setActionMsg(''); navigate('/invoices'); }, 1500);
    } catch (e) { setActionError(e.message); }
  };

  const clients = data?.clients ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500 text-sm mt-1">{total} clientes registrados</p>
        </div>
        <button onClick={() => navigate('/clients/new')} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nuevo Cliente
        </button>
      </div>

      {actionMsg && <Alert type="success" message={actionMsg} className="mb-4" />}
      {(error || actionError) && <Alert type="error" message={error || actionError} onClose={() => setActionError('')} className="mb-4" />}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9 text-sm" placeholder="Buscar por nombre..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="input w-40 text-sm" value={filterPlan} onChange={e => { setFilterPlan(e.target.value); setPage(1); }}>
          <option value="">Todos los planes</option>
          <option value="basic">Básico</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <select className="input w-40 text-sm" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
          <option value="">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="paused">Pausado</option>
          <option value="inactive">Inactivo</option>
        </select>
      </div>

      {loading ? <PageLoader /> : (
        <div className="card p-0 overflow-hidden">
          {clients.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400 text-sm">No hay clientes{search ? ' que coincidan con la búsqueda' : '. ¡Creá el primero!'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Nombre', 'Email', 'Plan', 'Bots', 'Msgs mes', 'Cobrado mes', 'Estado', 'Acciones'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {clients.map(client => (
                    <tr key={client._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{client.name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{client.email}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PLAN_BADGE[client.plan] ?? 'bg-gray-100 text-gray-600'}`}>
                          {client.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{client.botsCount ?? 0}</td>
                      <td className="px-4 py-3 text-gray-600">{(client.messagesThisMonth ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{fmt$(client.costThisMonth)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[client.status]}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[client.status]}`} />
                          {STATUS_LABEL[client.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => navigate(`/clients/${client._id}`)} title="Ver detalles"
                            className="p-1.5 rounded hover:bg-primary-50 text-gray-400 hover:text-primary-600 transition-colors">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button onClick={() => navigate(`/clients/${client._id}/edit`)} title="Editar"
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleGenerateInvoice(client)} title="Generar factura"
                            className="p-1.5 rounded hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors">
                            <FileText className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(client)} title="Eliminar"
                            className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="btn-secondary flex items-center gap-1 text-xs py-1.5 px-3 disabled:opacity-40">
                <ChevronLeft className="w-3.5 h-3.5" /> Anterior
              </button>
              <span className="text-xs text-gray-500">Pág. {page} de {pages} · {total} clientes</span>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                className="btn-secondary flex items-center gap-1 text-xs py-1.5 px-3 disabled:opacity-40">
                Siguiente <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
