import { useState } from 'react';
import { Check, Zap, Rocket, Building2 } from 'lucide-react';
import { botsApi } from '../lib/api.js';
import { useApi, useAsyncFn } from '../hooks/useApi.js';
import { PageLoader } from '../components/LoadingSpinner.jsx';
import Alert from '../components/Alert.jsx';

const PLANS = [
  {
    id: 'basic',
    name: 'Básico',
    price: 'Gratis',
    limit: '100 mensajes/mes',
    icon: Zap,
    color: 'border-gray-200',
    badge: 'bg-gray-100 text-gray-600',
    features: ['1 bot activo', '100 mensajes/mes', 'Historial 7 días', 'Soporte por email'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$29/mes',
    limit: '500 mensajes/mes',
    icon: Rocket,
    color: 'border-primary-500',
    badge: 'bg-primary-100 text-primary-700',
    features: ['5 bots activos', '500 mensajes/mes', 'Historial 30 días', 'FAQs ilimitadas', 'Soporte prioritario'],
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Consultar',
    limit: 'Ilimitado',
    icon: Building2,
    color: 'border-purple-500',
    badge: 'bg-purple-100 text-purple-700',
    features: ['Bots ilimitados', 'Mensajes ilimitados', 'Historial completo', 'API dedicada', 'SLA garantizado', 'Soporte 24/7'],
  },
];

export default function PlanConfig() {
  const { data: bots, loading, error, refetch } = useApi(botsApi.list);
  const updatePlan = useAsyncFn((id, plan) => botsApi.updatePlan(id, plan));
  const [success, setSuccess] = useState('');
  const [actionError, setActionError] = useState('');

  const handleChangePlan = async (botId, plan) => {
    try {
      await updatePlan.execute(botId, plan);
      setSuccess('Plan actualizado correctamente');
      refetch();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setActionError(e.message);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Planes y configuración</h1>
        <p className="text-gray-500 text-sm mt-1">Gestiona el plan de cada bot según tus necesidades</p>
      </div>

      {(error || actionError) && (
        <Alert type="error" message={error || actionError} onClose={() => setActionError('')} className="mb-4" />
      )}
      {success && <Alert type="success" message={success} className="mb-4" />}

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {PLANS.map(plan => {
          const Icon = plan.icon;
          return (
            <div
              key={plan.id}
              className={`relative bg-white rounded-xl border-2 ${plan.color} p-6 ${plan.highlight ? 'shadow-lg' : 'shadow-sm'}`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    MÁS POPULAR
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${plan.badge}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{plan.name}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${plan.badge}`}>{plan.limit}</span>
                </div>
              </div>
              <p className="text-3xl font-bold text-gray-900 mb-4">{plan.price}</p>
              <ul className="space-y-2">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Bot plan assignment */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Asignar plan a bots</h2>
        {bots?.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">No tienes bots creados aún</p>
        ) : (
          <div className="space-y-3">
            {bots?.map(bot => (
              <div key={bot._id} className="flex items-center justify-between p-4 rounded-lg border border-gray-100 bg-gray-50">
                <div>
                  <p className="font-medium text-gray-900">{bot.name}</p>
                  <p className="text-xs text-gray-500">{bot.messageCount} mensajes usados</p>
                </div>
                <div className="flex items-center gap-2">
                  {PLANS.map(plan => (
                    <button
                      key={plan.id}
                      onClick={() => handleChangePlan(bot._id, plan.id)}
                      disabled={updatePlan.loading}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        bot.plan === plan.id
                          ? 'bg-primary-500 text-white border-primary-500'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300 hover:text-primary-600'
                      }`}
                    >
                      {plan.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
