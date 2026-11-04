import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useStore } from '../store.jsx';

export default function Layout() {
  const { user, cart, logout } = useStore();
  const navigate = useNavigate();
  const count = cart.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <>
      <header className="header">
        <div className="container">
          <Link to="/" className="brand">
            <span className="brand-logo">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                <path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z" />
              </svg>
            </span>
            <span className="hide-mobile">Billetterie</span>
          </Link>
          <nav className="nav">
            <NavLink to="/" end>Événements</NavLink>
            {user && <NavLink to="/compte">Mon compte</NavLink>}
            {user?.role === 'admin' && <NavLink to="/admin">Tableau de bord</NavLink>}
          </nav>
          <span className="spacer" />
          {user ? (
            <>
              <NavLink to="/panier" className="btn btn-sm">
                Panier{count > 0 && <span className="cart-count">{count}</span>}
              </NavLink>
              <span className="subtle hide-mobile">{user.first_name}</span>
              <button className="btn btn-sm btn-ghost" onClick={() => { logout(); navigate('/'); }}>
                Déconnexion
              </button>
            </>
          ) : (
            <Link to="/connexion" className="btn btn-sm btn-primary">Se connecter</Link>
          )}
        </div>
      </header>

      <main className="container">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container row">
          <span>Projet BDD · M1 Dév EFREI</span>
          <span className="spacer" />
          <span>PostgreSQL · MongoDB · Redis · Node.js · React</span>
        </div>
      </footer>
    </>
  );
}
