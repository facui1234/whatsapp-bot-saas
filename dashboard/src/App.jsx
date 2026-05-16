import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import BotList from './pages/BotList.jsx';
import BotForm from './pages/BotForm.jsx';
import ConversationHistory from './pages/ConversationHistory.jsx';
import PlanConfig from './pages/PlanConfig.jsx';
import Admin from './pages/Admin.jsx';
import ClientList from './pages/ClientList.jsx';
import ClientForm from './pages/ClientForm.jsx';
import ClientDetail from './pages/ClientDetail.jsx';
import Invoices from './pages/Invoices.jsx';

function RequireAuth() {
  const auth = localStorage.getItem('auth');
  if (!auth) return <Navigate to="/login" replace />;
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-64 p-8 min-h-screen bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/clients" element={<ClientList />} />
          <Route path="/clients/new" element={<ClientForm />} />
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/clients/:id/edit" element={<ClientForm />} />
          <Route path="/bots" element={<BotList />} />
          <Route path="/bots/new" element={<BotForm />} />
          <Route path="/bots/:id/edit" element={<BotForm />} />
          <Route path="/bots/:id/history" element={<ConversationHistory />} />
          <Route path="/history" element={<ConversationHistory />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/plans" element={<PlanConfig />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
