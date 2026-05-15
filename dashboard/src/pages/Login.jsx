import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import Alert from '../components/Alert.jsx';

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (!form.email || !form.password) {
      setError('Completa todos los campos');
      return;
    }
    setLoading(true);
    // Simulated auth — replace with real auth when needed
    await new Promise(r => setTimeout(r, 600));
    localStorage.setItem('auth', JSON.stringify({ email: form.email, loggedAt: Date.now() }));
    navigate('/bots');
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-primary-500 rounded-2xl flex items-center justify-center mb-4">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">WhatsBot SaaS</h1>
          <p className="text-gray-400 text-sm mt-1">Gestión de bots de WhatsApp con IA</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Iniciar sesión</h2>

          {error && <Alert type="error" message={error} onClose={() => setError('')} className="mb-4" />}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Correo electrónico</label>
              <input
                type="email"
                className="input"
                placeholder="admin@empresa.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <label className="label">Contraseña</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>
            <button
              type="submit"
              className="btn-primary w-full py-3 mt-2"
              disabled={loading}
            >
              {loading ? 'Ingresando...' : 'Ingresar al panel'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            Demo: cualquier email y contraseña funcionan
          </p>
        </div>
      </div>
    </div>
  );
}
