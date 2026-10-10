import { useEffect, useRef, useState } from 'react';
import { Siren, MapPin, HeartPulse } from 'lucide-react';
import AiBriefing from '../components/AiBriefing.jsx';
import MedicalSummary from '../components/MedicalSummary.jsx';
import { api, Card, Pill, Err, LABEL, BADGE, DEFAULT_POS } from '../shared.jsx';

export default function Dispatcher({ list, res }) {
  const [sel, setSel] = useState(null);
  const [doctorId, setDoctorId] = useState('');
  const [bed, setBed] = useState('');
  const [err, setErr] = useState('');
  const cur = list.find((e) => e.id === sel) || list.find((e) => e.status === 'incoming');

  const confirm = () => api(`/emergencies/${cur.id}/assign`, 'PATCH', { doctorId, bedId: bed })
    .then(() => { setDoctorId(''); setBed(''); setErr(''); }).catch((e) => setErr(e.message));

  return (
    <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
      <Card>
        <h2 className="mb-2 font-semibold">Emergencies ({list.length})</h2>
        {list.length === 0 && <p className="text-sm text-slate-600">No alerts yet. Trigger an SOS from the Citizen tab.</p>}
        {list.map((e) => (
          <button key={e.id} onClick={() => setSel(e.id)}
            className={`mb-2 block w-full rounded-lg border p-3 text-left ${cur?.id === e.id ? 'border-slate-900' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between"><b>#{e.id}</b><Pill p={e.status === 'arrived' ? 'arrived' : e.priority} /></div>
            <div className="text-sm">{e.incidentType}</div>
            <div className="text-xs text-slate-500">{LABEL[e.status]}{e.unit && ` · ${e.unit} · ETA ${e.etaMinutes} min`}</div>
          </button>
        ))}
      </Card>
      {cur ? (
        <Card>
          <h2 className="text-lg font-bold">Case #{cur.id}: {cur.incidentType}</h2>
          <p className="text-sm font-medium">Patient: {cur.patientName}</p>
          {cur.notes && <p className="text-sm text-slate-600">Note: {cur.notes}</p>}
          <div className="mt-2 rounded-lg bg-slate-50 p-2"><MedicalSummary medical={cur.medical} /></div>
          <AiBriefing ai={cur.ai} onRefresh={() => api(`/emergencies/${cur.id}/ai/refresh`, 'POST').catch(() => {})} />
          {cur.vitals && (
            <p className="mt-2 rounded-lg bg-slate-100 p-2 text-sm">
              HR {cur.vitals.heartRate || '–'} bpm · BP {cur.vitals.bloodPressure || '–'} · SpO₂ {cur.vitals.oxygen || '–'}% · {cur.vitals.consciousness}
            </p>
          )}
          {cur.status === 'incoming' ? (<>
            <h3 className="mt-4 font-semibold">Assign a doctor</h3>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {res.doctors.map((d) => (
                <button key={d.id} disabled={d.status !== 'free'} onClick={() => setDoctorId(d.id)} aria-pressed={doctorId === d.id}
                  className={`rounded-lg border p-2 text-left text-sm disabled:opacity-40 ${doctorId === d.id ? 'border-teal-700 bg-teal-50' : 'border-slate-300'}`}>
                  {d.name}<span className="block text-xs text-slate-500">{d.specialty} · {d.status === 'free' ? 'Free now' : d.status}</span>
                </button>
              ))}
            </div>
            <h3 className="mt-4 font-semibold">Reserve a bed</h3>
            <div className="mt-1 grid grid-cols-4 gap-2">
              {res.beds.map((b) => (
                <button key={b.id} disabled={b.status !== 'free'} onClick={() => setBed(b.id)} aria-pressed={bed === b.id}
                  className={`rounded-lg border p-2 text-sm disabled:opacity-40 ${bed === b.id ? 'border-teal-700 bg-teal-50' : 'border-slate-300'}`}>
                  {b.label}<span className="block text-xs text-slate-500">{b.status === 'free' ? 'Free' : b.status === 'held' ? 'Held' : 'Occupied'}</span>
                </button>
              ))}
            </div>
            <button disabled={!doctorId || !bed} onClick={confirm}
              className="mt-4 w-full rounded-lg bg-slate-900 py-2.5 font-semibold text-white disabled:opacity-40">Confirm and notify crew</button>
            <Err msg={err} />
          </>) : (
            <p className="mt-4 text-sm text-teal-800">{cur.doctorName} and {cur.bed} reserved. Unit {cur.unit} notified.</p>
          )}
        </Card>
      ) : <Card><p className="text-slate-600">Select an emergency to review it.</p></Card>}
    </div>
  );
}

