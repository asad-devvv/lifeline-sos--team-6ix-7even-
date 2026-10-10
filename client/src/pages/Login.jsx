import { useEffect, useState } from 'react';
import { Siren, Stethoscope, Ambulance, Users } from 'lucide-react';
import { api, saveSession, Card, Err } from '../shared.jsx';

const ROLES = [
  ['citizen', 'Patient', 'Send an SOS with one tap and track your ambulance', Siren],
  ['guardian', 'Guardian or family member', 'Set up an account and medical records for a relative', Users],
  ['dispatcher', 'Hospital dispatcher', 'Review alerts, assign doctors and beds', Stethoscope],
  ['crew', 'Ambulance crew', 'Get your case, send vitals, update status', Ambulance],
];
const field = 'mt-1 w-full rounded-lg border border-slate-300 p-2';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ role: '', name: '', email: '', password: '', hospitalId: '', staffCode: '' });
  const [hospitals, setHospitals] = useState([]);
  const [err, setErr] = useState('');
  const reg = mode === 'register';
  const staff = reg && (f.role === 'dispatcher' || f.role === 'crew');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => { api('/hospitals/list').then(setHospitals).catch(() => {}); }, []);

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    api(reg ? '/auth/register' : '/auth/login', 'POST', f)
      .then((d) => { saveSession(d); onLogin(d); })
      .catch((x) => setErr(x.message));
  };

  return (
    <main className="mx-auto max-w-md p-4 pt-12">
      <h1 className="text-3xl font-extrabold tracking-tight">LifeLine</h1>
      <p className="mb-6 text-slate-600">{reg ? 'Create your account.' : 'Sign in to continue.'}</p>
      <Card>
        <form onSubmit={submit}>
          {reg && (
            <fieldset className="mb-4">
              <legend className="mb-2 font-semibold">How will you use LifeLine?</legend>
              <div className="space-y-2">
                {ROLES.map(([id, label, desc, Icon]) => (
                  <button type="button" key={id} onClick={() => setF({ ...f, role: id })} aria-pressed={f.role === id}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left ${f.role === id ? 'border-slate-900 bg-slate-50' : 'border-slate-300'}`}>
                    <Icon size={22} /><span><b className="block">{label}</b><span className="text-sm text-slate-600">{desc}</span></span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {reg && <label className="mb-3 block text-sm font-medium">Full name<input className={field} value={f.name} onChange={set('name')} autoComplete="name" /></label>}
          <label className="mb-3 block text-sm font-medium">Email<input className={field} type="email" value={f.email} onChange={set('email')} autoComplete="email" /></label>
          <label className="mb-3 block text-sm font-medium">Password{reg && ' (8 characters or more)'}
            <input className={field} type="password" value={f.password} onChange={set('password')} autoComplete={reg ? 'new-password' : 'current-password'} /></label>
          {staff && (<>
            <label className="mb-3 block text-sm font-medium">Your hospital
              <select className={field} value={f.hospitalId} onChange={set('hospitalId')}>
                <option value="">Choose a hospital</option>
                {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select></label>
            <label className="mb-3 block text-sm font-medium">Staff code
              <input className={field} value={f.staffCode} onChange={set('staffCode')} /></label>
          </>)}
          <button disabled={reg && !f.role} className="w-full rounded-lg bg-slate-900 py-2.5 font-semibold text-white disabled:opacity-40">
            {reg ? 'Create account' : 'Sign in'}</button>
          <Err msg={err} />
        </form>
        <button onClick={() => { setMode(reg ? 'login' : 'register'); setErr(''); }} className="mt-4 w-full text-center text-sm font-medium text-teal-800 underline">
          {reg ? 'I already have an account' : 'Create a new account'}</button>
      </Card>
    </main>
  );
}
