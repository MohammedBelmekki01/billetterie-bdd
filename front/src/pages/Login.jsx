import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useStore, useToast } from '../store.jsx';
import { ErrorBox } from '../components/ui.jsx';

const DEMO = [
  { email: 'client@example.com', label: 'Client de démonstration' },
  { email: 'admin@example.com', label: 'Administrateur' },
];

export default function Login() {
  const { login, register } = useStore();
  const notify = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const done = (user) => {
    notify(`Bienvenue ${user.first_name}`, 'success');
    navigate(location.state?.from || (user.role === 'admin' ? '/admin' : '/'));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      done(mode === 'login' ? await login(form.email, form.password) : await register(form));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const demo = async (email) => {
    setBusy(true);
    setError(null);
    try { done(await login(email, 'demo1234')); } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <div className="auth stack">
      <div className="card card-body">
        <div className="tabs" role="tablist">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Connexion</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Créer un compte</button>
        </div>
        <form onSubmit={submit} className="stack">
          {mode === 'register' && (
            <div className="grid grid-2">
              <div className="field"><label htmlFor="fn">Prénom</label><input id="fn" className="input" required value={form.first_name} onChange={set('first_name')} /></div>
              <div className="field"><label htmlFor="ln">Nom</label><input id="ln" className="input" required value={form.last_name} onChange={set('last_name')} /></div>
            </div>
          )}
          <div className="field"><label htmlFor="em">Email</label><input id="em" type="email" className="input" required autoComplete="email" value={form.email} onChange={set('email')} /></div>
          <div className="field">
            <label htmlFor="pw">Mot de passe</label>
            <input id="pw" type="password" className="input" required minLength={mode === 'register' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={set('password')} />
          </div>
          <ErrorBox error={error} />
          <button className="btn btn-primary btn-block" disabled={busy}>{mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</button>
        </form>
      </div>

      <div className="card card-body">
        <h3>Comptes de démonstration</h3>
        <p className="subtle">Mot de passe : <code>demo1234</code></p>
        <div className="demo-accounts">
          {DEMO.map((d) => (
            <button key={d.email} className="btn" disabled={busy} onClick={() => demo(d.email)}>
              {d.label} <span className="subtle">({d.email})</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
