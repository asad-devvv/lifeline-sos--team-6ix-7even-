import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import * as db from './db.js';
import { analyze } from './ai.js';
import { debugPage } from './debugPage.js';
import { hash, check, sign, verify } from './auth.js';

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const STAFF_CODE = process.env.LIFELINE_STAFF_CODE || 'lifeline-staff'; // required to register as dispatcher or crew
const ROLES = ['citizen', 'dispatcher', 'crew', 'guardian'];
const clean = (v, max = 200) => String(v || '').trim().slice(0, max);

const auth = (...roles) => (req, res, next) => {
  const u = verify((req.headers.authorization || '').replace('Bearer ', ''));
  if (!u) return res.status(401).json({ error: 'Please sign in again' });
  if (roles.length && !roles.includes(u.role)) return res.status(403).json({ error: 'Your role cannot do this' });
  req.user = u;
  next();
};
io.use((socket, next) => {
  const u = verify(socket.handshake.auth?.token);
  if (!u) return next(new Error('unauthorized'));
  socket.join(u.role === 'citizen' ? `user:${u.id}` : u.role === 'guardian' ? `guardian:${u.id}` : `hospital:${u.hospitalId}`);
  next();
});
const strip = (e) => ({ ...e, ai: null }); // the AI briefing is for hospital staff only
const push = (e) => {
  io.to(`hospital:${e.hospitalId}`).emit('emergency:update', e);
  let to = io.to(`user:${e.citizenId}`);
  db.guardiansOf(e.citizenId).forEach((g) => { to = to.to(`guardian:${g}`); });
  to.emit('emergency:update', strip(e));
};
const pushResources = (hid) => io.to(`hospital:${hid}`).emit('resources:update', db.resources(hid));
const session = (user) => ({ token: sign(user), user });

// ---- accounts ----
app.get('/api/hospitals/list', (_req, res) => res.json(db.hospitalList()));

app.post('/api/auth/register', (req, res) => {
  const { password, role, staffCode } = req.body;
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  if (name.length < 2) return res.status(400).json({ error: 'Enter your name (at least 2 characters)' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (String(password || '').length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Choose how you are using LifeLine' });
  if ((role === 'dispatcher' || role === 'crew') && staffCode !== STAFF_CODE) return res.status(403).json({ error: 'Invalid staff code' });
  const user = db.createUser({ name, email, passwordHash: hash(password), role, hospitalId: Number(req.body.hospitalId) });
  res.status(201).json(session(user));
});

app.post('/api/auth/login', (req, res) => {
  const row = db.userByEmail(String(req.body.email || '').trim().toLowerCase());
  if (!row || !check(String(req.body.password || ''), row.password_hash))
    return res.status(401).json({ error: 'Email or password is incorrect' });
  res.json(session({ id: row.id, name: row.name, role: row.role, hospitalId: row.hospital_id }));
});

// ---- emergencies ----
app.get('/api/hospitals/nearby', auth(), (req, res) => {
  const { lat, lng, radius } = req.query;
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat and lng are required numbers' });
  res.json(db.nearbyHospitals(+lat, +lng, +radius || 20));
});

app.post('/api/sos/trigger', auth('citizen'), (req, res) => {
  const { emergency, hospitals } = db.createEmergency({ ...req.body, citizenId: req.user.id });
  push(emergency);
  analyze(emergency.id).then((e) => e && push(e)).catch((err) => console.error(err)); // runs in the background, never delays the SOS
  res.status(201).json({ emergency: strip(emergency), hospitals });
});

app.get('/api/emergencies/incoming', auth(), (req, res) => res.json(db.listEmergencies(req.user)));
app.get('/api/resources', auth('dispatcher', 'crew'), (req, res) => res.json(db.resources(req.user.hospitalId)));

app.patch('/api/emergencies/:id/assign', auth('dispatcher'), (req, res) => {
  const e = db.assign(req.params.id, req.user.hospitalId, req.body.doctorId, req.body.bedId);
  push(e); pushResources(e.hospitalId);
  res.json(e);
});
app.patch('/api/emergencies/:id/status', auth('crew'), (req, res) => {
  const e = db.advance(req.params.id, req.user.hospitalId, req.body.status);
  push(e); if (e.status === 'completed') pushResources(e.hospitalId);
  res.json(e);
});
app.post('/api/emergencies/:id/vitals', auth('crew'), (req, res) => {
  const e = db.saveVitals(req.params.id, req.user.hospitalId, req.body);
  push(e);
  res.json(e);
});

// ---- guardians and medical records ----
const profileOf = (b) => ({ bloodGroup: clean(b.bloodGroup, 5), allergies: clean(b.allergies), conditions: clean(b.conditions) });
app.get('/api/guardian/patients', auth('guardian'), (req, res) => res.json(db.patientsOf(req.user.id)));
app.post('/api/guardian/patients', auth('guardian'), (req, res) => {
  const name = clean(req.body.name, 80), email = clean(req.body.email, 120).toLowerCase();
  if (name.length < 2) return res.status(400).json({ error: 'Enter the patient name (at least 2 characters)' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address for the patient' });
  if (String(req.body.password || '').length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  res.status(201).json(db.createPatientForGuardian(req.user.id, { name, email, passwordHash: hash(req.body.password), profile: profileOf(req.body) }));
});
app.put('/api/patients/:id/profile', auth('guardian'), (req, res) => res.json(db.updateProfile(req.user.id, req.params.id, profileOf(req.body))));
app.post('/api/patients/:id/reports', auth('guardian'), (req, res) =>
  res.status(201).json(db.addReport(req.user.id, req.params.id, { title: clean(req.body.title, 120), date: clean(req.body.date, 10), summary: clean(req.body.summary, 1000) })));
app.post('/api/patients/:id/reports/sample', auth('guardian'), (req, res) => res.status(201).json(db.addSampleReports(req.user.id, req.params.id)));
app.delete('/api/patients/:id/reports/:rid', auth('guardian'), (req, res) => res.json(db.deleteReport(req.user.id, req.params.id, req.params.rid)));
app.get('/api/me/medical', auth('citizen'), (req, res) => res.json(db.medicalFor(req.user.id)));
app.post('/api/emergencies/:id/cancel', auth('citizen'), (req, res) => {
  const e = db.cancel(req.params.id, req.user.id);
  push(e); pushResources(e.hospitalId);
  res.json(strip(e));
});

app.post('/api/emergencies/:id/ai/refresh', auth('dispatcher'), (req, res) => {
  const e = db.getEmergency(req.params.id);
  if (!e || e.hospitalId !== req.user.hospitalId) return res.status(404).json({ error: 'Case not found' });
  db.markAiPending(e.id);
  push(db.getEmergency(e.id));
  analyze(e.id).then((x) => x && push(x)).catch((err) => console.error(err));
  res.json({ ok: true });
});

// Browser view of the database. Only works from the machine the server runs on. Remove before deploying.
app.get('/api/debug/db', (req, res) => {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return res.status(403).send('Only available on the server machine');
  res.type('html').send(debugPage(db.dump()));
});

app.use((err, _req, res, _next) => {
  if (!(err instanceof db.HttpError)) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Server error' });
});

server.listen(4000, () => console.log('LifeLine API on http://localhost:4000'));
