import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Clock, Cpu, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { botsApi } from '../lib/api.js';
import { PageLoader } from '../components/LoadingSpinner.jsx';
import Alert from '../components/Alert.jsx';

function formatDate(ts) {
  return new Date(ts).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function msToSec(ms) {
  return (ms / 1000).toFixed(2) + 's';
}

export default function ConversationHistory() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [bot, setBot] = useState(null);
  const [history, setHistory] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedConv, setSelectedConv] = useState(null);
  const [view, setView] = useState('history');

  const LIMIT = 20;

  useEffect(() => {
    botsApi.get(id).then(setBot).catch(() => navigate('/bots'));
  }, [id, navigate]);

  useEffect(() => {
    if (view !== 'history') return;
    setLoading(true);
    const params = { page, limit: LIMIT };
    if (search) params.sender = search;
    botsApi.getHistory(id, params)
      .then(data => {
        setHistory(data.history);
        setTotal(data.total);
        setPages(data.pages);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, page, search, view]);

  useEffect(() => {
    if (view !== 'conversations') return;
    setLoading(true);
    botsApi.getConversations(id)
      .then(setConversations)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, view]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/bots')} className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {bot ? bot.name : 'Historial'}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Historial de conversaciones y mensajes</p>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setView('history')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'history' ? 'bg-primary-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          Log de mensajes
        </button>
        <button
          onClick={() => { setView('conversations'); setSelectedConv(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'conversations' ? 'bg-primary-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          Conversaciones
        </button>
      </div>

      {error && <Alert type="error" message={error} className="mb-4" />}

      {/* Message History Log */}
      {view === 'history' && (
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="input pl-9 text-sm"
                placeholder="Buscar por número..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <span className="text-sm text-gray-500 whitespace-nowrap">{total} mensajes</span>
          </div>

          {loading ? <PageLoader /> : (
            <>
              <div className="space-y-3">
                {history.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p>Sin mensajes aún</p>
                  </div>
                )}
                {history.map(msg => (
                  <div key={msg._id} className={`rounded-lg border p-4 ${msg.error ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'}`}>
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <span className="text-xs font-mono font-medium text-gray-600">{msg.senderNumber}</span>
                      <div className="flex items-center gap-3 text-xs text-gray-400 flex-shrink-0">
                        {msg.tokensUsed > 0 && (
                          <span className="flex items-center gap-1">
                            <Cpu className="w-3 h-3" />
                            {msg.tokensUsed} tk
                          </span>
                        )}
                        {msg.processingTime > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {msToSec(msg.processingTime)}
                          </span>
                        )}
                        <span>{formatDate(msg.timestamp)}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-gray-400 mb-1 font-medium">Usuario</p>
                        <p className="text-gray-800">{msg.message}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1 font-medium">{msg.error ? 'Error' : 'Respuesta'}</p>
                        <p className={msg.error ? 'text-red-600' : 'text-gray-800'}>
                          {msg.error || msg.response || '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {pages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="btn-secondary flex items-center gap-1 text-sm py-1.5 px-3 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Anterior
                  </button>
                  <span className="text-sm text-gray-500">Pág. {page} de {pages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(pages, p + 1))}
                    disabled={page === pages}
                    className="btn-secondary flex items-center gap-1 text-sm py-1.5 px-3 disabled:opacity-40"
                  >
                    Siguiente
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Conversations View */}
      {view === 'conversations' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card lg:col-span-1">
            <h3 className="font-semibold text-gray-900 mb-3">Contactos</h3>
            {loading ? <PageLoader /> : (
              <div className="space-y-2">
                {conversations.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-8">Sin conversaciones</p>
                )}
                {conversations.map(conv => (
                  <button
                    key={conv._id}
                    onClick={() => setSelectedConv(conv)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedConv?._id === conv._id
                        ? 'border-primary-300 bg-primary-50'
                        : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-900">{conv.senderNumber}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {conv.messages.length} mensajes · {formatDate(conv.lastMessageAt)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card lg:col-span-2">
            {!selectedConv ? (
              <div className="text-center py-16 text-gray-400">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>Selecciona una conversación</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-900">{selectedConv.senderNumber}</h3>
                  <span className="text-xs text-gray-400">{selectedConv.messages.length} mensajes</span>
                </div>
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {selectedConv.messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                        msg.role === 'user'
                          ? 'bg-gray-100 text-gray-800 rounded-tl-sm'
                          : 'bg-primary-500 text-white rounded-tr-sm'
                      }`}>
                        {msg.content}
                        <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-gray-400' : 'text-primary-200'}`}>
                          {formatDate(msg.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
