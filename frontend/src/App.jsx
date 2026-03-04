import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import RegisterPage from './pages/RegisterPage';
import LoginPage    from './pages/LoginPage';
import Dashboard    from './pages/Dashboard';

function AppInner() {
  const { auth } = useAuth();
  const [page, setPage] = useState('login'); // 'login' | 'register'

  if (auth) return <Dashboard />;

  return page === 'login'
    ? <LoginPage    onSwitch={() => setPage('register')} />
    : <RegisterPage onSwitch={() => setPage('login')}    />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
