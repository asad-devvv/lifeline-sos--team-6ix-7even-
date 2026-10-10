import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Map: OpenStreetMap tiles (via Leaflet) + driving routes from the free OSRM demo server.
const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const distKm = (a, b) => {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

export default function CrewMap({ patient, hospital, status }) {
  const el = useRef(null), map = useRef(null), layers = useRef({}), origin = useRef(null);
  const [mode, setMode] = useState('demo'); // 'demo' = simulated ambulance, 'live' = this device's GPS
  const [pos, setPos] = useState(null);
  const [route, setRoute] = useState(null);
  const [idx, setIdx] = useState(0);
  const [err, setErr] = useState('');

  const toPatient = status === 'assigned' || status === 'en_route';
  const target = toPatient ? patient : hospital;
  const tkey = `${target.lat},${target.lng}`;
  const driving = status === 'en_route' || status === 'picked_up';

  const fetchRoute = (from) => {
    origin.current = from;
    fetch(`${OSRM}/${from.lng},${from.lat};${target.lng},${target.lat}?overview=full&geometries=geojson`)
      .then((r) => r.json())
      .then((d) => {
        const r = d.routes?.[0];
        if (!r) throw new Error('no route');
        setRoute({ coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]), km: r.distance / 1000, min: r.duration / 60 });
        setErr('');
      })
      .catch(() => setErr('Could not load the route. Check your internet connection.'));
  };

  // create the map once
  useEffect(() => {
    map.current = L.map(el.current).setView([patient.lat, patient.lng], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map.current);
    return () => { map.current.remove(); map.current = null; };
  }, []);

  // demo mode: start about 3 km from the patient (or at the scene for the hospital leg), then fetch the route
  useEffect(() => {
    if (mode !== 'demo') return;
    const s = toPatient ? { lat: patient.lat + 0.02, lng: patient.lng + 0.02 } : { lat: patient.lat, lng: patient.lng };
    setPos(s); setRoute(null); setIdx(0); fetchRoute(s);
  }, [mode, tkey, toPatient]);

  // demo mode: drive along the route (about 60 seconds) while the crew is en route
  useEffect(() => {
    if (mode !== 'demo' || !driving || !route) return;
    const step = Math.max(1, Math.ceil(route.coords.length / 60));
    const t = setInterval(() => setIdx((i) => Math.min(i + step, route.coords.length - 1)), 1000);
    return () => clearInterval(t);
  }, [mode, driving, route]);

  // live mode: follow this device's GPS and re-route when it has moved more than 200 m
  useEffect(() => {
    if (mode !== 'live') return;
    origin.current = null; setRoute(null); setPos(null);
    if (!navigator.geolocation) { setErr('This device has no GPS. Use demo mode.'); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setErr('Location access was denied. Allow it in the browser or use demo mode.'),
      { enableHighAccuracy: true });
    return () => navigator.geolocation.clearWatch(id);
  }, [mode, tkey]);
  useEffect(() => {
    if (mode === 'live' && pos && (!origin.current || distKm(origin.current, pos) > 0.2)) fetchRoute(pos);
  }, [mode, pos]);

  const at = mode === 'demo' && route ? route.coords[Math.min(idx, route.coords.length - 1)] : null;
  const shown = at ? { lat: at[0], lng: at[1] } : pos;
  const frac = mode === 'demo' && route ? 1 - idx / Math.max(route.coords.length - 1, 1) : 1;

  // draw route and markers
  useEffect(() => {
    const m = map.current, l = layers.current;
    if (!m) return;
    ['route', 'amb', 'tgt'].forEach((k) => l[k]?.remove());
    if (route) l.route = L.polyline(route.coords, { color: '#0f766e', weight: 5 }).addTo(m);
    l.tgt = L.circleMarker([target.lat, target.lng], { radius: 9, color: '#fff', weight: 2, fillColor: toPatient ? '#dc2626' : '#0f766e', fillOpacity: 1 })
      .bindTooltip(toPatient ? 'Patient' : 'Hospital').addTo(m);
    if (shown) l.amb = L.circleMarker([shown.lat, shown.lng], { radius: 8, color: '#fff', weight: 2, fillColor: '#0f172a', fillOpacity: 1 })
      .bindTooltip('Ambulance').addTo(m);
  }, [route, shown?.lat, shown?.lng, tkey, toPatient]);
  useEffect(() => {
    if (route && map.current) map.current.fitBounds(L.polyline(route.coords).getBounds(), { padding: [30, 30] });
  }, [route]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">{toPatient ? 'Route to patient' : 'Route to hospital'}</h3>
        <div className="flex gap-1 text-xs">
          {[['demo', 'Demo'], ['live', 'Live GPS']].map(([id, label]) => (
            <button key={id} onClick={() => setMode(id)} aria-pressed={mode === id}
              className={`rounded-md px-2 py-1 font-medium ${mode === id ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>{label}</button>
          ))}
        </div>
      </div>
      <div ref={el} className="relative z-0 h-64 w-full rounded-lg" />
      <p className="mt-2 text-sm text-slate-700">
        {route ? `${(route.km * frac).toFixed(1)} km left · about ${Math.max(1, Math.ceil(route.min * frac))} min` : 'Loading route…'}
        {mode === 'demo' && !driving && route && ' · the demo ambulance drives once you start the trip'}
      </p>
      {err && <p role="alert" className="mt-1 text-sm text-red-700">{err}</p>}
    </div>
  );
}
