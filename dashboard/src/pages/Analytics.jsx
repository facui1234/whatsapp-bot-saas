import { useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts';
import { MessageSquare, Users, Zap, Calendar, TrendingUp } from 'lucide-react';
import { analyticsApi, botsApi } from '../lib/api.js';
import { useApi } from '../hooks/useApi.js';
import { PageLoader } from '../components/LoadingSpinner.jsx';

const RANGES = [
  { label: 'Últimos 7 días',  days: 7 },
  { label: 'Últimos 30 días', days: 30 },
  { label: 'Últimos 90 días', days: 90 },
];

function fromDays(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().substring(0, 10);
}

function StatCard({ icon: Icon, label, value, color = 'text-primary-600' }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-gray-100 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

const BAR_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#14b8a6'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-medium text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="text-xs">
          {p.name ?? 'Mensajes'}: <span className="font-semibold">{p.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
};

export default function Analytics() {
  const [range, setRange] = useState(30);
  const [botId, setBotId] = useState('');

  const params = { from: fromDays(range) + 'T00:00:00Z', ...(botId && { botId }) };

  const { data: bots }     = useApi(botsApi.list, []);
  const { data: summary, loading: loadSum } = useApi(() => analyticsApi.summary(params), [range, botId]);
  const { data: hours,   loading: loadH }   = useApi(() => analyticsApi.hours(params),   [range, botId]);
  const { data: days,    loading: loadD }   = useApi(() => analyticsApi.days(params),    [range, botId]);
  const { data: daily,   loading: loadDly } = useApi(() => analyticsApi.daily({ ...params, days: range }), [range, botId]);
  const { data: keywords, loading: loadK }  = useApi(() => analyticsApi.keywords({ ...params, top: 15 }), [range, botId]);
  const { data: botStats, loading: loadB }  = useApi(() => analyticsApi.bots(params),   [range, botId]);

  const peakHour = hours?.reduce((a, b) => b.messages > a.messages ? b : a, { hour: 0, messages: 0 });
  const peakDay  = days?.reduce((a, b) => b.messages > a.messages ? b : a, { day: '—', messages: 0 });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500 text-sm mt-1">Métricas de actividad y patrones de uso</p>
        </div>
        <div className="flex gap-2">
          <select className="input w-44 text-sm" value={botId} onChange={e => setBotId(e.target.value)}>
            <option value="">Todos los bots</option>
            {(bots ?? []).map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {RANGES.map(r => (
              <button key={r.days} onClick={() => setRange(r.days)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  range === r.days ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {loadSum ? <div className="mb-6"><PageLoader /></div> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard icon={MessageSquare} label="Mensajes totales" value={(summary?.totalMessages ?? 0).toLocaleString()} color="text-primary-600" />
          <StatCard icon={Users} label="Usuarios únicos" value={(summary?.uniqueUsers ?? 0).toLocaleString()} color="text-green-600" />
          <StatCard icon={Zap} label="Tokens usados" value={(summary?.totalTokens ?? 0).toLocaleString()} color="text-amber-600" />
          <StatCard icon={Calendar} label="Días con actividad" value={summary?.activeDays ?? 0} color="text-blue-600" />
        </div>
      )}

      {/* Peak highlights */}
      {(peakHour || peakDay) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="card bg-gradient-to-br from-primary-50 to-white border-primary-100">
            <p className="text-xs text-primary-500 font-semibold uppercase tracking-wide mb-1">Hora pico</p>
            <p className="text-3xl font-bold text-gray-900">{peakHour?.hour ?? '—'}:00 hs</p>
            <p className="text-sm text-gray-500 mt-1">{(peakHour?.messages ?? 0).toLocaleString()} mensajes en este horario</p>
          </div>
          <div className="card bg-gradient-to-br from-green-50 to-white border-green-100">
            <p className="text-xs text-green-600 font-semibold uppercase tracking-wide mb-1">Día más activo</p>
            <p className="text-3xl font-bold text-gray-900">{peakDay?.day ?? '—'}</p>
            <p className="text-sm text-gray-500 mt-1">{(peakDay?.messages ?? 0).toLocaleString()} mensajes en promedio</p>
          </div>
        </div>
      )}

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Hourly chart */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary-500" /> Mensajes por hora del día
          </h3>
          {loadH ? <div className="h-48 flex items-center justify-center"><PageLoader /></div> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hours ?? []} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickFormatter={h => `${h}h`} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="messages" fill="#6366f1" radius={[3, 3, 0, 0]} name="Mensajes" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Day of week chart */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-green-500" /> Mensajes por día de la semana
          </h3>
          {loadD ? <div className="h-48 flex items-center justify-center"><PageLoader /></div> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={days ?? []} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={d => d.substring(0, 3)} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="messages" fill="#22c55e" radius={[3, 3, 0, 0]} name="Mensajes" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Daily trend */}
      <div className="card mb-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-amber-500" /> Evolución diaria de mensajes
        </h3>
        {loadDly ? <div className="h-48 flex items-center justify-center"><PageLoader /></div> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={daily ?? []} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d?.substring(5)} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="messages" stroke="#f59e0b" strokeWidth={2} dot={false} name="Mensajes" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Keywords + per-bot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Top keywords */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">Palabras más frecuentes en mensajes</h3>
          {loadK ? <PageLoader /> : (
            keywords?.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Sin datos en el período</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={keywords ?? []} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="word" tick={{ fontSize: 12 }} width={56} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" fill="#14b8a6" radius={[0, 3, 3, 0]} name="Menciones" />
                </BarChart>
              </ResponsiveContainer>
            )
          )}
        </div>

        {/* Per-bot stats */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">Actividad por bot</h3>
          {loadB ? <PageLoader /> : (
            botStats?.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Sin datos en el período</p>
            ) : (
              <div className="space-y-3">
                {(botStats ?? []).map((b, i) => {
                  const max = botStats[0]?.messages ?? 1;
                  return (
                    <div key={b.botId}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700 truncate max-w-[180px]">{b.name}</span>
                        <span className="text-gray-500 text-xs flex-shrink-0 ml-2">
                          {b.messages.toLocaleString()} msgs · {b.users} usuarios
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${(b.messages / max) * 100}%`, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
