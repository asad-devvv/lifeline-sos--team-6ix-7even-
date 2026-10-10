import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const KEY = 'lifeline.session';
export const getSession = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
export const saveSession = (s) => localStorage.setItem(KEY, JSON.stringify(s));
export const clearSession = () => localStorage.removeItem(KEY);

export const api = async (path, method = 'GET', body) => {
  const s = getSession();
  const r = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(s ? { Authorization: `Bearer ${s.token}` } : {}) },
    body: body && JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && s) { clearSession(); location.reload(); }
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
};

export const DEFAULT_POS = { lat: 33.6844, lng: 73.0479 };
export const BADGE = { critical: 'bg-red-600 text-white', urgent: 'bg-amber-500 text-slate-900', arrived: 'bg-teal-700 text-white' };
export const LABEL = { incoming: 'Incoming', assigned: 'Crew notified', en_route: 'En route to patient', arrived: 'Arrived at scene', picked_up: 'En route to hospital', completed: 'Completed', cancelled: 'Cancelled' };

export const Card = ({ children, className = '' }) => <section className={`rounded-xl bg-white p-4 shadow-sm ${className}`}>{children}</section>;
export const Pill = ({ p }) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE[p]}`}>{p}</span>;
export const Err = ({ msg }) => (msg ? <p role="alert" className="mt-2 text-sm text-red-700">{msg}</p> : null);

export function useFeed(token) {
  const [list, setList] = useState([]);
  const [res, setRes] = useState({ doctors: [], beds: [] });
  useEffect(() => {
    api('/emergencies/incoming').then(setList).catch(() => {});
    api('/resources').then(setRes).catch(() => {});
    const socket = io({ auth: { token } });
    socket.on('emergency:update', (e) =>
      setList((l) => (l.some((x) => x.id === e.id) ? l.map((x) => (x.id === e.id ? e : x)) : [e, ...l])));
    socket.on('resources:update', setRes);
    return () => socket.disconnect();
  }, [token]);
  return { list, res };
}
