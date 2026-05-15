import { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle, XCircle, RefreshCw, Send, Trash2, RotateCcw,
  Activity, Bot, MessageSquare, Users, Zap, Clock, Cpu,
  AlertTriangle, ChevronDown, Terminal, Database, Key,
} from 'lucide-react';
import { adminApi, botsApi } from '../lib/api.js';
import { useApi, useAsyncFn } from '../hooks/useApi.js';
import { PageLoader } from '../components/LoadingSpinner.jsx';
import Alert from '../components/Alert.jsx';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function formatDate(ts) {
  return new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function msToSec(ms) { return (ms / 1000).toFixed(2) + 's'; }

// ─── Status Dot ──────────────────────────────────────────────────────────────

function StatusDot({ ok, loading }) {
  if (loading) return <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse inline-block" />;
  return <span className={`w-2.5 h-2.5 rounded-full inline-block ${ok ? 'bg-green-400' : 'bg-red-400'}`} />;
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
        <p className="text-sm text-gray-500">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── System Status Panel ─────────────────────────────────────────────────────

function SystemStatus() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const check = useCallback(() => {
    setLoading(true);
    adminApi.health()
      .then(setHealth)
      .catch(() => setHealth(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { check(); }, [check]);

  const rows = health ? [
    {
      icon: Database,
      label: 'MongoDB',
      ok: health.mongodb.ok,
      detail: health.mongodb.state,
    },
    {
      icon: Zap,
      label: 'Claude API',
      ok: health.claude.ok,
      detail: health.claude.ok ? 'Respondiendo' : health.claude.error || (health.claude.configured ? 'Sin respuesta' : 'No configurado'),
    },
    {
      icon: MessageSquare,
      label: 'Twilio',
      ok: health.twilio.ok,
      detail: health.twilio.configured ? 'Configurado' : 'Variables faltantes',
    },
  ] : [];

  const envVars = health ? Object.entries(health.env) : [];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Estado del sistema</h3>
        <button onClick={check} disabled={loading} className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && !health && <div className="space-y-3">{[0,1,2].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}</div>}

      <div className="space-y-2 mb-4">
        {rows.map(row => {
          const Icon = row.icon;
          return (
            <div key={row.label} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
              <div className="flex items-center gap-2.5">
                <Icon className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">{row.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{row.detail}</span>
                <StatusDot ok={row.ok} loading={loading} />
              </div>
            </div>
          );
        })}
      </div>

      {envVars.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5"><Key className="w-3.5 h-3.5" />Variables de entorno</p>
          <div className="grid grid-cols-1 gap-1">
            {envVars.map(([key, present]) => (
              <div key={key} className="flex items-center justify-between text-xs">
                <span className="font-mono text-gray-500">{key}</span>
                {present
                  ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  : <XCircle className="w-3.5 h-3.5 text-red-400" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Bot Tester ───────────────────────────────────────────────────────────────

function BotTester({ bots }) {
  const [selectedBot, setSelectedBot] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const bot = bots?.find(b => b._id === selectedBot);

  const handleSend = async () => {
    if (!selectedBot || !input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setError('');

    const newMessages = [...messages, {
      role: 'user', content: userMsg, ts: new Date().toISOString(),
    }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const history = newMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
      const result = await adminApi.testBot(selectedBot, userMsg, history);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.response,
        ts: new Date().toISOString(),
        meta: { tokens: result.tokensUsed, time: result.processingTime },
      }]);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  const clearChat = () => { setMessages([]); setError(''); };

  const PRESETS = [
    'Hola, ¿en qué me podés ayudar?',
    '¿Cuáles son sus horarios?',
    '¿Hacen envíos?',
    'Quiero hacer un pedido',
    'Necesito un turno para mañana',
  ];

  return (
    <div className="card flex flex-col h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary-500" />
          Tester de Bots
        </h3>
        <button onClick={clearChat} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors">
          <Trash2 className="w-3.5 h-3.5" /> Limpiar
        </button>
      </div>

      {/* Bot selector */}
      <div className="mb-3 flex-shrink-0">
        <div className="relative">
          <select
            className="input pr-8 appearance-none"
            value={selectedBot}
            onChange={e => { setSelectedBot(e.target.value); setMessages([]); setError(''); }}
          >
            <option value="">Seleccionar bot para probar...</option>
            {bots?.map(b => (
              <option key={b._id} value={b._id}>
                {b.name} ({b.twilioNumber}) — {b.active ? 'Activo' : 'Inactivo'}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Preset messages */}
      {selectedBot && messages.length === 0 && (
        <div className="mb-3 flex-shrink-0">
          <p className="text-xs text-gray-400 mb-2">Mensajes de prueba rápidos:</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(p => (
              <button
                key={p}
                onClick={() => setInput(p)}
                className="text-xs px-2.5 py-1 rounded-full bg-gray-100 hover:bg-primary-100 hover:text-primary-700 text-gray-600 transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto rounded-lg bg-gray-50 p-3 space-y-3 min-h-0">
        {!selectedBot && (
          <div className="h-full flex items-center justify-center text-gray-300">
            <div className="text-center">
              <Bot className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Seleccioná un bot para empezar</p>
            </div>
          </div>
        )}

        {selectedBot && messages.length === 0 && !loading && (
          <div className="h-full flex items-center justify-center text-gray-300">
            <p className="text-sm">Enviá un mensaje para probar el bot "{bot?.name}"</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
              msg.role === 'user'
                ? 'bg-primary-500 text-white rounded-tr-sm'
                : 'bg-white text-gray-800 border border-gray-100 shadow-sm rounded-tl-sm'
            }`}>
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              <div className={`flex items-center gap-2 mt-1 text-xs ${msg.role === 'user' ? 'text-primary-200' : 'text-gray-400'}`}>
                <span>{formatTime(msg.ts)}</span>
                {msg.meta && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1"><Cpu className="w-3 h-3" />{msg.meta.tokens}tk</span>
                    <span>·</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{msToSec(msg.meta.time)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1.5 items-center">
                <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} className="mt-2 flex-shrink-0" />}

      {/* Input */}
      <div className="mt-3 flex gap-2 flex-shrink-0">
        <textarea
          className="input resize-none text-sm h-10 py-2 flex-1"
          placeholder={selectedBot ? 'Escribí un mensaje...' : 'Seleccioná un bot primero'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={!selectedBot || loading}
          rows={1}
        />
        <button
          onClick={handleSend}
          disabled={!selectedBot || !input.trim() || loading}
          className="btn-primary px-3 flex-shrink-0 flex items-center justify-center"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1 flex-shrink-0">Enter para enviar · Shift+Enter para nueva línea · No cuenta tokens de producción</p>
    </div>
  );
}

// ─── Quick Actions ────────────────────────────────────────────────────────────

function QuickActions({ bots, onDone }) {
  const [selectedBot, setSelectedBot] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const resetCounter = useAsyncFn(adminApi.resetCounter);
  const clearConvs = useAsyncFn(adminApi.clearConversations);

  const run = async (fn, label) => {
    if (!selectedBot) { setError('Seleccioná un bot'); return; }
    if (!window.confirm(`¿${label} del bot seleccionado?`)) return;
    setError(''); setMsg('');
    try {
      const r = await fn(selectedBot);
      setMsg(r.message || 'Listo');
      onDone?.();
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="card">
      <h3 className="font-semibold text-gray-900 mb-4">Acciones rápidas</h3>

      <div className="mb-4">
        <label className="label">Seleccionar bot</label>
        <select className="input" value={selectedBot} onChange={e => setSelectedBot(e.target.value)}>
          <option value="">Elegir bot...</option>
          {bots?.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
        </select>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} className="mb-3" />}
      {msg && <Alert type="success" message={msg} className="mb-3" />}

      <div className="space-y-2">
        <button
          onClick={() => run(resetCounter.execute, 'Resetear contador de mensajes')}
          disabled={resetCounter.loading}
          className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors text-left text-sm disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4 text-primary-500 flex-shrink-0" />
          <div>
            <p className="font-medium text-gray-700">Resetear contador de mensajes</p>
            <p className="text-xs text-gray-400">Vuelve messageCount a 0 (útil para tests de límite)</p>
          </div>
        </button>

        <button
          onClick={() => run(clearConvs.execute, 'Borrar historial de conversaciones')}
          disabled={clearConvs.loading}
          className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-red-200 hover:bg-red-50 transition-colors text-left text-sm disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4 text-red-400 flex-shrink-0" />
          <div>
            <p className="font-medium text-gray-700">Borrar historial del bot</p>
            <p className="text-xs text-gray-400">Elimina todas las conversaciones guardadas</p>
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── Activity Log ─────────────────────────────────────────────────────────────

function ActivityLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    adminApi.logs({ limit: 25, onlyErrors })
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [onlyErrors]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchLogs, 5000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchLogs]);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary-500" />
          Log de actividad
        </h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded"
              checked={onlyErrors}
              onChange={e => setOnlyErrors(e.target.checked)}
            />
            Solo errores
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (5s)
          </label>
          <button onClick={fetchLogs} disabled={loading} className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && logs.length === 0 ? (
        <PageLoader />
      ) : logs.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Sin actividad registrada</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-100">
                <th className="pb-2 pr-3 text-xs font-medium text-gray-400">Hora</th>
                <th className="pb-2 pr-3 text-xs font-medium text-gray-400">Bot</th>
                <th className="pb-2 pr-3 text-xs font-medium text-gray-400">Número</th>
                <th className="pb-2 pr-3 text-xs font-medium text-gray-400">Mensaje</th>
                <th className="pb-2 pr-3 text-xs font-medium text-gray-400 text-right">Tokens</th>
                <th className="pb-2 text-xs font-medium text-gray-400 text-right">Tiempo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map(log => (
                <tr key={log._id} className={`${log.error ? 'bg-red-50' : ''}`}>
                  <td className="py-2 pr-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(log.timestamp)}</td>
                  <td className="py-2 pr-3 text-xs text-gray-600 max-w-[100px] truncate">
                    {log.botId?.name || '—'}
                  </td>
                  <td className="py-2 pr-3 text-xs font-mono text-gray-500 whitespace-nowrap">
                    {log.senderNumber?.replace('whatsapp:', '')}
                  </td>
                  <td className="py-2 pr-3">
                    {log.error ? (
                      <span className="flex items-center gap-1 text-red-600 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate max-w-[200px]">{log.error}</span>
                      </span>
                    ) : (
                      <span className="text-gray-700 truncate max-w-[220px] block">{log.message}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs text-right text-gray-400">
                    {log.tokensUsed > 0 ? log.tokensUsed : '—'}
                  </td>
                  <td className="py-2 text-xs text-right text-gray-400 whitespace-nowrap">
                    {log.processingTime > 0 ? msToSec(log.processingTime) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────

export default function Admin() {
  const { data: bots, loading: botsLoading, refetch: refetchBots } = useApi(botsApi.list);
  const { data: stats, loading: statsLoading, refetch: refetchStats } = useApi(adminApi.stats);

  const planLimit = plan => plan === 'enterprise' ? '∞' : plan === 'pro' ? 500 : 100;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin & Testing</h1>
        <p className="text-gray-500 text-sm mt-1">
          Panel de administración, pruebas y monitoreo del sistema
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        <StatCard icon={Bot} label="Total bots" value={statsLoading ? '…' : stats?.totalBots} color="blue" />
        <StatCard icon={Activity} label="Bots activos" value={statsLoading ? '…' : stats?.activeBots} color="green" />
        <StatCard icon={MessageSquare} label="Mensajes totales" value={statsLoading ? '…' : stats?.totalMessages} color="purple" />
        <StatCard icon={Users} label="Conversaciones" value={statsLoading ? '…' : stats?.totalConversations} color="orange" />
        <StatCard
          icon={AlertTriangle}
          label="Errores (24h)"
          value={statsLoading ? '…' : stats?.errors24h}
          sub={`${stats?.last24h ?? 0} msgs hoy`}
          color={stats?.errors24h > 0 ? 'red' : 'green'}
        />
      </div>

      {/* Main two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {/* Bot tester — 2 cols */}
        <div className="xl:col-span-2">
          {botsLoading ? <div className="card h-[600px] flex items-center justify-center"><PageLoader /></div> : <BotTester bots={bots} />}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <SystemStatus />
          <QuickActions bots={bots} onDone={() => { refetchBots(); refetchStats(); }} />
        </div>
      </div>

      {/* Bot usage table */}
      {!botsLoading && bots?.length > 0 && (
        <div className="card mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">Uso por bot</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100">
                  {['Bot', 'Rubro', 'Plan', 'Mensajes', 'Límite', 'Estado'].map(h => (
                    <th key={h} className="pb-2 pr-4 text-xs font-medium text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {bots.map(bot => {
                  const limit = planLimit(bot.plan);
                  const pct = limit === '∞' ? 0 : Math.round((bot.messageCount / Number(limit)) * 100);
                  return (
                    <tr key={bot._id}>
                      <td className="py-2.5 pr-4 font-medium text-gray-800">{bot.name}</td>
                      <td className="py-2.5 pr-4 text-gray-500 capitalize">{bot.rubric}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          bot.plan === 'enterprise' ? 'bg-purple-100 text-purple-700' :
                          bot.plan === 'pro' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{bot.plan}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-700">{bot.messageCount}</td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            {limit !== '∞' && (
                              <div
                                className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-primary-500'}`}
                                style={{ width: `${pct}%` }}
                              />
                            )}
                            {limit === '∞' && <div className="h-full w-full bg-purple-300 rounded-full" />}
                          </div>
                          <span className="text-xs text-gray-400">{limit === '∞' ? '∞' : `${pct}%`}</span>
                        </div>
                      </td>
                      <td className="py-2.5">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${bot.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${bot.active ? 'bg-green-500' : 'bg-gray-400'}`} />
                          {bot.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Activity log */}
      <ActivityLog />
    </div>
  );
}
