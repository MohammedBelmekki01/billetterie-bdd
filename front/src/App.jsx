import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router';
import { StoreProvider, ToastProvider, useStore } from './store.jsx';
import Layout from './components/Layout.jsx';
import { Empty, Spinner } from './components/ui.jsx';
import Home from './pages/Home.jsx';
import EventPage from './pages/EventPage.jsx';
import Cart from './pages/Cart.jsx';
import Account from './pages/Account.jsx';
import OrderPage from './pages/OrderPage.jsx';
import Login from './pages/Login.jsx';
import Admin from './pages/Admin.jsx';

// Protège une page : connexion requise (et rôle admin si demandé)
function Protected({ admin, children }) {
  const { user, ready } = useStore();
  const location = useLocation();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/connexion" state={{ from: location.pathname }} replace />;
  if (admin && user.role !== 'admin') return <Empty><h2>Accès réservé aux administrateurs</h2></Empty>;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <StoreProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="evenements/:id" element={<EventPage />} />
              <Route path="connexion" element={<Login />} />
              <Route path="panier" element={<Protected><Cart /></Protected>} />
              <Route path="compte" element={<Protected><Account /></Protected>} />
              <Route path="compte/commandes/:id" element={<Protected><OrderPage /></Protected>} />
              <Route path="admin" element={<Protected admin><Admin /></Protected>} />
              <Route path="*" element={<Empty><h2>Page introuvable</h2><Link to="/">Retour à l'accueil</Link></Empty>} />
            </Route>
          </Routes>
        </StoreProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
