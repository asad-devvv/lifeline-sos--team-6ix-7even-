import { useEffect, useRef, useState } from 'react';
import { Siren, MapPin, HeartPulse } from 'lucide-react';
import AiBriefing from '../components/AiBriefing.jsx';
import MedicalSummary from '../components/MedicalSummary.jsx';
import CrewMap from '../components/CrewMap.jsx';
import { api, Card, Pill, Err, LABEL, BADGE, DEFAULT_POS } from '../shared.jsx';

export default function Crew({ list }) {
  const cur = list.find((e) => ['assigned', 'en_route', 'arrived', 'picked_up'].includes(e.status));
  const [v, setV] = useState({ heartRate: '', bloodPressure: '', oxygen: '', consciousness: 'Conscious' });
  const [err, setErr] = useState('');
  if (!cur) return <Card><p className="text-slate-600">No active case. Assign a crew from the Dispatcher tab.</p></Card>;
  const act = (p) => p.then(() => setErr('')).catch((e) => setErr(e.message));
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const inp = 'w-full rounded-lg border border-slate-300 p-2';

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-slate-500">Crew unit {cur.unit} · Case #{cur.id}</p>
        <h2 className="text-xl font-bold">{LABEL[cur.status]}</h2>
        <p className="mt-1 text-slate-600">{cur.incidentType} · scene {cur.location.lat.toFixed(4)}, {cur.location.lng.toFixed(4)}</p>
        <p className="mt-2 text-3xl font-bold">ETA {cur.etaMinutes} min</p>
        {cur.status === 'assigned' && <button onClick={() => act(api(`/emergencies/${cur.id}/status`, 'PATCH', { status: 'en_route' }))} className="mt-3 w-full rounded-lg bg-slate-900 py-2.5 font-semibold text-white">Start driving to patient</button>}
        {cur.status === 'en_route' && <button onClick={() => act(api(`/emergencies/${cur.id}/status`, 'PATCH', { status: 'arrived' }))} className="mt-3 w-full rounded-lg bg-slate-900 py-2.5 font-semibold text-white">Mark arrived at scene</button>}
      </Card>
      <Card>
        <h3 className="mb-1 font-semibold">Patient: {cur.patientName}</h3>
        <MedicalSummary medical={cur.medical} />
        <AiBriefing ai={cur.ai} compact />
      </Card>
      <Card>
        <CrewMap patient={cur.location} hospital={cur.hospitalLocation} status={cur.status} />
      </Card>
      <Card>
        <h3 className="mb-2 flex items-center gap-1 font-semibold"><HeartPulse size={18} />Patient condition</h3>
        <div className="mb-3 grid grid-cols-3 gap-2">
          {['Conscious', 'Unconscious', 'Bleeding'].map((c) => (
            <button key={c} aria-pressed={v.consciousness === c} onClick={() => setV({ ...v, consciousness: c })}
              className={`rounded-lg border py-2 text-sm ${v.consciousness === c ? 'border-red-600 bg-red-50 text-red-700' : 'border-slate-300'}`}>{c}</button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs">Heart rate (bpm)<input className={inp} inputMode="numeric" value={v.heartRate} onChange={set('heartRate')} /></label>
          <label className="text-xs">BP (mmHg)<input className={inp} placeholder="120/80" value={v.bloodPressure} onChange={set('bloodPressure')} /></label>
          <label className="text-xs">SpO₂ (%)<input className={inp} inputMode="numeric" value={v.oxygen} onChange={set('oxygen')} /></label>
        </div>
        <button onClick={() => act(api(`/emergencies/${cur.id}/vitals`, 'POST', v))} className="mt-3 w-full rounded-lg border-2 border-slate-900 py-2 font-semibold">Send update to hospital</button>
        {cur.status === 'arrived' && <button onClick={() => act(api(`/emergencies/${cur.id}/status`, 'PATCH', { status: 'picked_up' }))} className="mt-2 w-full rounded-lg bg-red-600 py-2.5 font-semibold text-white">Mark patient picked up</button>}
        {cur.status === 'picked_up' && <button onClick={() => act(api(`/emergencies/${cur.id}/status`, 'PATCH', { status: 'completed' }))} className="mt-2 w-full rounded-lg bg-teal-700 py-2.5 font-semibold text-white">Patient handed over to hospital</button>}
        <Err msg={err} />
      </Card>
    </div>
  );
}

