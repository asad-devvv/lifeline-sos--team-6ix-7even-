import { useEffect, useState } from 'react';
import { Siren, MapPin } from 'lucide-react';
import { api, Card, Err, LABEL, DEFAULT_POS } from '../shared.jsx';
import MedicalSummary from '../components/MedicalSummary.jsx';

export default function Citizen({ list }) {
  const [type, setType] = useState('Other');
  const [notes, setNotes] = useState('');
  const [pos, setPos] = useState(null);
  const [approx, setApprox] = useState(false);
  const [hospitals, setHospitals] = useState([]);
  const [medical, setMedical] = useState(null);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const done = (p, fallback) => {
      setPos(p); setApprox(fallback);
      api(`/hospitals/nearby?lat=${p.lat}&lng=${p.lng}`).then(setHospitals).catch((e) => setErr(e.message));
    };
    if (!navigator.geolocation) return done(DEFAULT_POS, true);
    navigator.geolocation.getCurrentPosition((g) => done({ lat: g.coords.latitude, lng: g.coords.longitude }, false), () => done(DEFAULT_POS, true), { timeout: 4000 });
    api('/me/medical').then(setMedical).catch(() => {});
  }, []);

  const send = () => {
    if (!pos || sending) return;
    setSending(true); setErr('');
    api('/sos/trigger', 'POST', { ...pos, incidentType: type, notes }).catch((e) => setErr(e.message)).finally(() => setSending(false));
  };
  const mine = list.find((e) => !['completed', 'cancelled'].includes(e.status));
  const cancel = () => api(`/emergencies/${mine.id}/cancel`, 'POST').then(() => setConfirming(false)).catch((e) => setErr(e.message));

  if (mine) return (
    <Card>
      <h2 className="text-xl font-bold">{mine.status === 'incoming' ? 'Request sent' : 'Help is on the way'}</h2>
      <p className="mt-1 text-slate-600">{mine.hospitalName} · {mine.distanceKm} km</p>
      <p className="mt-4 text-sm font-medium text-teal-800">{LABEL[mine.status]}</p>
      {mine.unit
        ? <p className="mt-2 text-4xl font-bold">ETA {mine.etaMinutes} min <span className="text-base font-medium text-slate-600">Unit {mine.unit}</span></p>
        : <p className="mt-2 text-slate-600">Waiting for the hospital to assign a crew…</p>}
      {['incoming', 'assigned'].includes(mine.status) && (confirming ? (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="font-medium">Cancel this emergency request?</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button onClick={cancel} className="rounded-lg bg-red-600 py-2 font-semibold text-white">Yes, cancel it</button>
            <button onClick={() => setConfirming(false)} className="rounded-lg border border-slate-300 bg-white py-2 font-semibold">No, keep it</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirming(true)} className="mt-5 w-full rounded-lg border-2 border-slate-300 py-2.5 font-semibold text-slate-700">
          Pressed by mistake? Cancel request</button>
      ))}
      <Err msg={err} />
    </Card>
  );

  return (
    <div className="space-y-4">
      <Card className="text-center">
        <button onClick={send} disabled={!pos || sending} aria-label="Send SOS emergency request"
          className="mx-auto grid h-52 w-52 select-none place-items-center rounded-full bg-red-600 text-white shadow-lg ring-8 ring-red-200 active:scale-95 disabled:opacity-50">
          <span><Siren className="mx-auto" size={48} /><span className="block text-3xl font-extrabold">{sending ? 'Sending…' : 'SOS'}</span><span className="text-sm">tap once to send</span></span>
        </button>
        <p className="mt-3 flex items-center justify-center gap-1 text-sm text-slate-600">
          <MapPin size={14} />{!pos ? 'Finding your location…' : approx ? 'We could not find your location. A default location will be used.' : 'Location locked. Alerts go to hospitals within 20 km'}
        </p>
        <p className="mt-1 text-sm text-slate-500">Sent by mistake? You can cancel right after.</p>
        <Err msg={err} />
      </Card>
      <Card>
        <h3 className="mb-2 font-semibold">What happened? (optional)</h3>
        <div className="grid grid-cols-2 gap-2">
          {['Accident', 'Heart attack', 'Breathing', 'Other'].map((t) => (
            <button key={t} onClick={() => setType(t)} aria-pressed={type === t}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${type === t ? 'border-red-600 bg-red-50 text-red-700' : 'border-slate-300'}`}>{t}</button>
          ))}
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note for the hospital" className="mt-3 w-full rounded-lg border border-slate-300 p-2 text-sm" rows={2} />
      </Card>
      <Card>
        <h3 className="mb-2 font-semibold">Your medical information</h3>
        <MedicalSummary medical={medical} />
        <p className="mt-2 text-xs text-slate-500">Hospitals see this when you send an SOS. Your guardian can update it.</p>
      </Card>
      <Card>
        <h3 className="mb-2 font-semibold">Nearby hospitals</h3>
        {hospitals.length === 0 && <p className="text-sm text-slate-600">No registered hospitals within 20 km.</p>}
        {hospitals.map((h) => (
          <div key={h.id} className="flex items-center justify-between border-t border-slate-100 py-2 first:border-0">
            <span>{h.name}<span className="block text-xs text-slate-500">{h.distanceKm} km</span></span>
            <span className={`text-sm font-medium ${h.status === 'available' ? 'text-teal-700' : 'text-amber-700'}`}>{h.status === 'available' ? 'Available' : 'Busy'}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
