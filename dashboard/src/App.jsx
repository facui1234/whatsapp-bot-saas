import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Login from './pages/Login.jsx';
import BotList from './pages/BotList.jsx';
import BotForm from './pages/BotForm.jsx';
import ConversationHistory from './pages/ConversationHistory.jsx';
import PlanConfig from './pages/PlanConfig.jsx';
import Admin from './pages/Admin.jsx';

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
          <Route path="/bots" element={<BotList />} />
          <Route path="/bots/new" element={<BotForm />} />
          <Route path="/bots/:id/edit" element={<BotForm />} />
          <Route path="/bots/:id/history" element={<ConversationHistory />} />
          <Route path="/history" element={<ConversationHistory />} />
          <Route path="/plans" element={<PlanConfig />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/" element={<Navigate to="/bots" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/bots" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
