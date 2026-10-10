import { useEffect, useState } from 'react';
import { api, Card, Err, LABEL } from '../shared.jsx';

const input = 'mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm';
const BLOOD = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const today = () => new Date().toISOString().slice(0, 10);
const blank = { name: '', email: '', password: '', bloodGroup: '', allergies: '', conditions: '' };

function ProfileFields({ v, set }) {
  return (<>
    <label className="mt-2 block text-sm font-medium">Blood group
      <select className={input} value={v.bloodGroup} onChange={set('bloodGroup')}>{BLOOD.map((b) => <option key={b} value={b}>{b || 'Not known'}</option>)}</select></label>
    <label className="mt-2 block text-sm font-medium">Allergies<input className={input} value={v.allergies} onChange={set('allergies')} placeholder="For example: penicillin" /></label>
    <label className="mt-2 block text-sm font-medium">Medical conditions<input className={input} value={v.conditions} onChange={set('conditions')} placeholder="For example: diabetes, high blood pressure" /></label>
  </>);
}

export default function Guardian({ list }) {
  const [patients, setPatients] = useState([]);
  const [selId, setSelId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState(blank);
  const [pf, setPf] = useState(null);
  const [rf, setRf] = useState({ title: '', date: today(), summary: '' });
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState('');
  const sel = patients.find((p) => p.id === selId);
  const active = sel && list.find((e) => e.citizenId === sel.id && !['completed', 'cancelled'].includes(e.status));
  const fail = (e) => setErr(e.message);
  const replace = (c) => { setPatients((ps) => (ps.some((x) => x.id === c.id) ? ps.map((x) => (x.id === c.id ? c : x)) : [...ps, c])); setErr(''); };
  const setN = (k) => (e) => setNf({ ...nf, [k]: e.target.value });
  const setP = (k) => (e) => { setPf({ ...pf, [k]: e.target.value }); setSaved(''); };

  useEffect(() => {
    api('/guardian/patients').then((ps) => { setPatients(ps); if (ps[0]) setSelId(ps[0].id); else setAdding(true); }).catch(fail);
  }, []);
  useEffect(() => { if (sel) setPf(sel.profile); }, [selId]);

  const create = (e) => {
    e.preventDefault();
    api('/guardian/patients', 'POST', nf).then((c) => { replace(c); setSelId(c.id); setAdding(false); setNf(blank); }).catch(fail);
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {patients.map((p) => (
            <button key={p.id} onClick={() => { setSelId(p.id); setAdding(false); }} aria-pressed={!adding && selId === p.id}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${!adding && selId === p.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300'}`}>{p.name}</button>
          ))}
          <button onClick={() => setAdding(true)} className="rounded-lg border border-dashed border-slate-400 px-3 py-1.5 text-sm font-medium">+ Add a person</button>
        </div>
        <Err msg={err} />
      </Card>

      {adding && (
        <Card>
          <h2 className="font-bold">Set up an account for a family member</h2>
          <p className="text-sm text-slate-600">They sign in with this email and password and get the one-tap SOS screen.</p>
          <form onSubmit={create}>
            <label className="mt-2 block text-sm font-medium">Their full name<input className={input} value={nf.name} onChange={setN('name')} /></label>
            <label className="mt-2 block text-sm font-medium">Their email<input className={input} type="email" value={nf.email} onChange={setN('email')} /></label>
            <label className="mt-2 block text-sm font-medium">Password for them (8 characters or more)<input className={input} type="password" value={nf.password} onChange={setN('password')} autoComplete="new-password" /></label>
            <ProfileFields v={nf} set={setN} />
            <button className="mt-4 w-full rounded-lg bg-slate-900 py-2.5 font-semibold text-white">Create account</button>
          </form>
        </Card>
      )}

      {!adding && sel && (<>
        <Card>
          <h2 className="text-lg font-bold">{sel.name}</h2>
          <p className="text-sm text-slate-600">{sel.email}</p>
          {active
            ? <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm font-medium text-red-800">Emergency in progress: {LABEL[active.status]}{active.unit && ` · Unit ${active.unit} · ETA ${active.etaMinutes} min`}</p>
            : <p className="mt-2 text-sm text-slate-500">No active emergency.</p>}
        </Card>
        <Card>
          <h3 className="font-semibold">Medical information</h3>
          {pf && <ProfileFields v={pf} set={setP} />}
          <button onClick={() => api(`/patients/${sel.id}/profile`, 'PUT', pf).then((c) => { replace(c); setSaved('Saved'); }).catch(fail)}
            className="mt-3 w-full rounded-lg border-2 border-slate-900 py-2 font-semibold">Save medical information</button>
          {saved && <p role="status" className="mt-1 text-sm text-teal-800">{saved}</p>}
        </Card>
        <Card>
          <h3 className="font-semibold">Past medical reports ({sel.reports.length})</h3>
          {sel.reports.length === 0 && <p className="text-sm text-slate-500">No reports yet. Add one below, or add sample reports to try the app.</p>}
          <ul className="mt-2 space-y-2">
            {sel.reports.map((r) => (
              <li key={r.id} className="rounded-lg border border-slate-200 p-2 text-sm">
                <div className="flex items-start justify-between gap-2"><b>{r.title}</b>
                  <button onClick={() => api(`/patients/${sel.id}/reports/${r.id}`, 'DELETE').then(replace).catch(fail)} className="text-xs text-red-700 underline">Delete</button></div>
                <span className="text-slate-500">{r.date}</span><p>{r.summary}</p>
              </li>
            ))}
          </ul>
          <form className="mt-3 border-t border-slate-100 pt-3" onSubmit={(e) => {
            e.preventDefault();
            api(`/patients/${sel.id}/reports`, 'POST', rf).then((c) => { replace(c); setRf({ title: '', date: today(), summary: '' }); }).catch(fail);
          }}>
            <label className="block text-sm font-medium">Report title<input className={input} value={rf.title} onChange={(e) => setRf({ ...rf, title: e.target.value })} placeholder="For example: ECG, blood test" /></label>
            <label className="mt-2 block text-sm font-medium">Report date<input className={input} type="date" value={rf.date} onChange={(e) => setRf({ ...rf, date: e.target.value })} /></label>
            <label className="mt-2 block text-sm font-medium">What it says<textarea className={input} rows={2} value={rf.summary} onChange={(e) => setRf({ ...rf, summary: e.target.value })} /></label>
            <button className="mt-3 w-full rounded-lg bg-slate-900 py-2.5 font-semibold text-white">Add report</button>
          </form>
          <button onClick={() => api(`/patients/${sel.id}/reports/sample`, 'POST').then(replace).catch(fail)}
            className="mt-2 w-full rounded-lg border-2 border-slate-300 py-2 text-sm font-semibold">Add 3 sample reports</button>
        </Card>
      </>)}
    </div>
  );
}
