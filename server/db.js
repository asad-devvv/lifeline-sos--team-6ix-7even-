// SQLite database (file: server/lifeline.db). Uses Node's built-in node:sqlite, so nothing extra to install.
import { DatabaseSync } from 'node:sqlite';
import crypto from 'crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const db = new DatabaseSync(process.env.LIFELINE_DB || 'lifeline.db');
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS hospitals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'available');
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('citizen','dispatcher','crew','guardian')),
  hospital_id INTEGER REFERENCES hospitals(id), created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS doctors (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hospital_id INTEGER NOT NULL REFERENCES hospitals(id),
  name TEXT NOT NULL, specialty TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'free');
CREATE TABLE IF NOT EXISTS beds (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hospital_id INTEGER NOT NULL REFERENCES hospitals(id),
  label TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'free');
CREATE TABLE IF NOT EXISTS emergencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT, citizen_id INTEGER NOT NULL REFERENCES users(id),
  hospital_id INTEGER NOT NULL REFERENCES hospitals(id), incident_type TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '', priority TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'incoming',
  lat REAL NOT NULL, lng REAL NOT NULL, distance_km REAL NOT NULL,
  doctor_id INTEGER REFERENCES doctors(id), bed_id INTEGER REFERENCES beds(id),
  unit TEXT, eta_minutes INTEGER, vitals TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS guardianships (
  guardian_id INTEGER NOT NULL REFERENCES users(id), patient_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (guardian_id, patient_id));
CREATE TABLE IF NOT EXISTS medical_profiles (
  patient_id INTEGER PRIMARY KEY REFERENCES users(id), blood_group TEXT NOT NULL DEFAULT '',
  allergies TEXT NOT NULL DEFAULT '', conditions TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS medical_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL,
  report_date TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', created_by INTEGER REFERENCES users(id), created_at INTEGER NOT NULL);
`);

// add the AI briefing columns to databases created before this feature
const emCols = db.prepare('PRAGMA table_info(emergencies)').all().map((c) => c.name);
for (const [n, t] of [['ai_status', "TEXT NOT NULL DEFAULT 'none'"], ['ai_source', 'TEXT'], ['ai_summary', 'TEXT'], ['ai_at', 'INTEGER']])
  if (!emCols.includes(n)) db.exec(`ALTER TABLE emergencies ADD COLUMN ${n} ${t}`);

// upgrade databases made before the guardian role existed (their users table only allows 3 roles)
const usersSql = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'users'").get().sql;
if (!usersSql.includes("'guardian'")) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  db.exec(usersSql.replace(/^CREATE TABLE (IF NOT EXISTS )?"?users"?/i, 'CREATE TABLE users_new').replace("'crew')", "'crew','guardian')"));
  db.exec('INSERT INTO users_new SELECT * FROM users; DROP TABLE users; ALTER TABLE users_new RENAME TO users;');
  db.exec('COMMIT');
  db.exec('PRAGMA foreign_keys = ON');
}
if (!db.prepare("SELECT 1 FROM sqlite_sequence WHERE name = 'emergencies'").get())
  db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('emergencies', 2040)").run(); // case numbers start at 2041

const tx = (fn) => {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
};

// ---- seed demo hospitals once ----
if (!db.prepare('SELECT 1 FROM hospitals').get()) {
  const C = { lat: 33.6844, lng: 73.0479 };
  const H = [['City General Hospital', 0.011, 0.009, 'available'], ['Riverside Medical Center', -0.02, 0.015, 'busy'],
    ['St. Mary Emergency Care', 0.03, -0.02, 'available'], ['Northgate Clinic', 0.09, 0.09, 'available']];
  const DOCS = [['Dr. Amna Rauf', 'Emergency medicine'], ['Dr. Bilal Khan', 'Cardiology'], ['Dr. Sara Malik', 'Trauma surgery']];
  tx(() => {
    for (const [name, dl, dg, status] of H) {
      const id = Number(db.prepare('INSERT INTO hospitals (name, lat, lng, status) VALUES (?,?,?,?)').run(name, C.lat + dl, C.lng + dg, status).lastInsertRowid);
      DOCS.forEach(([n, s]) => db.prepare('INSERT INTO doctors (hospital_id, name, specialty) VALUES (?,?,?)').run(id, n, s));
      ['ER-1', 'ER-2', 'ICU-1', 'Ward B-1'].forEach((l) => db.prepare('INSERT INTO beds (hospital_id, label) VALUES (?,?)').run(id, l));
    }
  });
}

// token-signing secret: env var, or a random one stored once in the database
export const getSecret = () => {
  if (process.env.LIFELINE_SECRET) return process.env.LIFELINE_SECRET;
  const row = db.prepare("SELECT value FROM meta WHERE key = 'secret'").get();
  if (row) return row.value;
  const v = crypto.randomBytes(32).toString('hex');
  db.prepare("INSERT INTO meta (key, value) VALUES ('secret', ?)").run(v);
  return v;
};

const km = (a, b) => {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

// read-only snapshot of every table for the browser viewer (password hashes are never included)
export const dump = () => Object.fromEntries(['users', 'hospitals', 'doctors', 'beds', 'emergencies'].map((t) => [t,
  db.prepare(t === 'users' ? 'SELECT id, name, email, role, hospital_id, created_at FROM users' : `SELECT * FROM ${t}`).all().map((r) => ({ ...r }))]));

// ---- users & hospitals ----
export const hospitalList = () => db.prepare('SELECT id, name FROM hospitals ORDER BY name').all().map((h) => ({ ...h }));
export const nearbyHospitals = (lat, lng, radius = 20) =>
  db.prepare('SELECT * FROM hospitals').all()
    .map((h) => ({ id: h.id, name: h.name, status: h.status, lat: h.lat, lng: h.lng, distanceKm: +km({ lat, lng }, h).toFixed(1) }))
    .filter((h) => h.distanceKm <= radius).sort((a, b) => a.distanceKm - b.distanceKm);

export const userByEmail = (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email);
export function createUser({ name, email, passwordHash, role, hospitalId }) {
  if (userByEmail(email)) throw new HttpError(409, 'An account with this email already exists');
  const staff = role === 'dispatcher' || role === 'crew';
  hospitalId = Number(hospitalId) || 0;
  if (staff && !db.prepare('SELECT 1 FROM hospitals WHERE id = ?').get(hospitalId)) throw new HttpError(400, 'Choose your hospital');
  const hid = staff ? hospitalId : null;
  const id = Number(db.prepare('INSERT INTO users (name, email, password_hash, role, hospital_id, created_at) VALUES (?,?,?,?,?,?)')
    .run(name, email, passwordHash, role, hid, Date.now()).lastInsertRowid);
  return { id, name, role, hospitalId: hid };
}

// ---- emergencies ----
const SELECT = `SELECT e.*, u.name AS patient_name, h.name AS hospital_name, h.lat AS h_lat, h.lng AS h_lng, d.name AS doctor_name, b.label AS bed_label FROM emergencies e
  JOIN hospitals h ON h.id = e.hospital_id JOIN users u ON u.id = e.citizen_id LEFT JOIN doctors d ON d.id = e.doctor_id LEFT JOIN beds b ON b.id = e.bed_id`;
const shape = (r) => ({
  id: r.id, citizenId: r.citizen_id, patientName: r.patient_name, medical: medicalFor(r.citizen_id), hospitalId: r.hospital_id, hospitalName: r.hospital_name, hospitalLocation: { lat: r.h_lat, lng: r.h_lng }, distanceKm: r.distance_km,
  incidentType: r.incident_type, notes: r.notes, priority: r.priority, status: r.status, location: { lat: r.lat, lng: r.lng },
  vitals: r.vitals ? JSON.parse(r.vitals) : null, doctorId: r.doctor_id, doctorName: r.doctor_name, bed: r.bed_label,
  unit: r.unit, etaMinutes: r.eta_minutes,
  ai: { status: r.ai_status, source: r.ai_source, summary: r.ai_summary ? JSON.parse(r.ai_summary) : null, at: r.ai_at }, createdAt: r.created_at,
});
export const getEmergency = (id) => { const r = db.prepare(SELECT + ' WHERE e.id = ?').get(id); return r && shape(r); };
export const listEmergencies = (user) =>
  (user.role === 'guardian'
    ? db.prepare(SELECT + ' WHERE e.citizen_id IN (SELECT patient_id FROM guardianships WHERE guardian_id = ?) ORDER BY e.id DESC LIMIT 50').all(user.id)
    : user.role === 'citizen'
    ? db.prepare(SELECT + ' WHERE e.citizen_id = ? ORDER BY e.id DESC LIMIT 50').all(user.id)
    : db.prepare(SELECT + ' WHERE e.hospital_id = ? ORDER BY e.id DESC LIMIT 100').all(user.hospitalId)).map(shape)
    .map((e) => (user.role === 'dispatcher' || user.role === 'crew' ? e : { ...e, ai: null })); // patients and guardians never see the AI briefing

const PRIORITY = { 'Heart attack': 'critical', Breathing: 'critical', Accident: 'urgent', Other: 'urgent' };
export function createEmergency({ citizenId, lat, lng, incidentType, notes }) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !PRIORITY[incidentType]) throw new HttpError(400, 'lat, lng and a valid incidentType are required');
  if (db.prepare("SELECT 1 FROM emergencies WHERE citizen_id = ? AND status NOT IN ('completed', 'cancelled')").get(citizenId)) throw new HttpError(409, 'You already have an active emergency');
  const hospitals = nearbyHospitals(lat, lng);
  if (!hospitals.length) throw new HttpError(404, 'No registered hospital within 20 km');
  const t = hospitals.find((h) => h.status === 'available') || hospitals[0];
  const now = Date.now();
  const id = Number(db.prepare(`INSERT INTO emergencies (citizen_id, hospital_id, incident_type, notes, priority, lat, lng, distance_km, created_at, updated_at, ai_status)
    VALUES (?,?,?,?,?,?,?,?,?,?,'pending')`).run(citizenId, t.id, incidentType, String(notes || '').slice(0, 500), PRIORITY[incidentType], lat, lng, t.distanceKm, now, now).lastInsertRowid);
  return { emergency: getEmergency(id), hospitals };
}

export const resources = (hospitalId) => ({
  doctors: db.prepare('SELECT id, name, specialty, status FROM doctors WHERE hospital_id = ?').all(hospitalId).map((r) => ({ ...r })),
  beds: db.prepare('SELECT id, label, status FROM beds WHERE hospital_id = ?').all(hospitalId).map((r) => ({ ...r })),
});

const own = (id, hospitalId) => {
  const e = db.prepare('SELECT * FROM emergencies WHERE id = ? AND hospital_id = ?').get(Number(id), hospitalId);
  if (!e) throw new HttpError(404, 'Case not found');
  return e;
};

export const assign = (id, hospitalId, doctorId, bedId) => tx(() => {
  const e = own(id, hospitalId);
  if (e.status !== 'incoming') throw new HttpError(409, 'This case already has a crew');
  const d = db.prepare('SELECT * FROM doctors WHERE id = ? AND hospital_id = ?').get(Number(doctorId), hospitalId);
  const b = db.prepare('SELECT * FROM beds WHERE id = ? AND hospital_id = ?').get(Number(bedId), hospitalId);
  if (!d || d.status !== 'free') throw new HttpError(409, 'Choose a doctor who is free');
  if (!b || b.status !== 'free') throw new HttpError(409, 'Choose a bed that is free');
  const n = Number(db.prepare('SELECT COUNT(*) AS n FROM emergencies WHERE unit IS NOT NULL').get().n);
  const eta = Math.ceil((1.5 + Math.random() * 2.5) * 2.5);
  db.prepare("UPDATE doctors SET status = 'busy' WHERE id = ?").run(d.id);
  db.prepare("UPDATE beds SET status = 'held' WHERE id = ?").run(b.id);
  db.prepare("UPDATE emergencies SET doctor_id = ?, bed_id = ?, status = 'assigned', unit = ?, eta_minutes = ?, updated_at = ? WHERE id = ?")
    .run(d.id, b.id, `A-${String(7 + n).padStart(2, '0')}`, eta, Date.now(), e.id);
  return getEmergency(e.id);
});

const NEXT = { assigned: 'en_route', en_route: 'arrived', arrived: 'picked_up', picked_up: 'completed' };
export const advance = (id, hospitalId, status) => tx(() => {
  const e = own(id, hospitalId);
  if (NEXT[e.status] !== status) throw new HttpError(409, 'This case is not ready for that step');
  const eta = status === 'picked_up' ? Math.ceil(e.distance_km * 2) : status === 'en_route' ? e.eta_minutes : 0;
  db.prepare('UPDATE emergencies SET status = ?, eta_minutes = ?, updated_at = ? WHERE id = ?').run(status, eta, Date.now(), e.id);
  if (status === 'completed') { // free the doctor and bed for the next case
    db.prepare("UPDATE doctors SET status = 'free' WHERE id = ?").run(e.doctor_id);
    db.prepare("UPDATE beds SET status = 'free' WHERE id = ?").run(e.bed_id);
  }
  return getEmergency(e.id);
});

export const saveVitals = (id, hospitalId, v) => {
  const e = own(id, hospitalId);
  if (!['assigned', 'en_route', 'arrived', 'picked_up'].includes(e.status)) throw new HttpError(409, 'This case is not active');
  const vitals = { heartRate: v.heartRate, bloodPressure: v.bloodPressure, oxygen: v.oxygen, consciousness: v.consciousness, at: Date.now() };
  db.prepare('UPDATE emergencies SET vitals = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(vitals), Date.now(), e.id);
  return getEmergency(e.id);
};

// ---- cancelling a request sent by mistake (only before the ambulance starts moving) ----
export const cancel = (id, citizenId) => tx(() => {
  const e = db.prepare('SELECT * FROM emergencies WHERE id = ? AND citizen_id = ?').get(Number(id), citizenId);
  if (!e) throw new HttpError(404, 'Request not found');
  if (e.status === 'cancelled') throw new HttpError(409, 'This request is already cancelled');
  if (!['incoming', 'assigned'].includes(e.status)) throw new HttpError(409, 'The ambulance is already on its way. Please call the hospital.');
  if (e.doctor_id) db.prepare("UPDATE doctors SET status = 'free' WHERE id = ?").run(e.doctor_id);
  if (e.bed_id) db.prepare("UPDATE beds SET status = 'free' WHERE id = ?").run(e.bed_id);
  db.prepare("UPDATE emergencies SET status = 'cancelled', eta_minutes = NULL, updated_at = ? WHERE id = ?").run(Date.now(), e.id);
  return getEmergency(e.id);
});

// ---- guardians, medical profiles and reports ----
export const medicalFor = (patientId) => ({
  profile: { bloodGroup: '', allergies: '', conditions: '', ...db.prepare('SELECT blood_group AS bloodGroup, allergies, conditions FROM medical_profiles WHERE patient_id = ?').get(patientId) },
  reports: db.prepare('SELECT id, title, report_date AS date, summary FROM medical_reports WHERE patient_id = ? ORDER BY report_date DESC, id DESC').all(patientId).map((r) => ({ ...r })),
});
const patientCard = (id) => ({ ...db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(id), ...medicalFor(id) });
export const patientsOf = (gid) => db.prepare('SELECT patient_id FROM guardianships WHERE guardian_id = ? ORDER BY patient_id').all(gid).map((r) => patientCard(r.patient_id));
export const guardiansOf = (pid) => db.prepare('SELECT guardian_id FROM guardianships WHERE patient_id = ?').all(pid).map((r) => r.guardian_id);
const guard = (gid, pid) => {
  if (!db.prepare('SELECT 1 FROM guardianships WHERE guardian_id = ? AND patient_id = ?').get(gid, Number(pid))) throw new HttpError(403, 'You do not look after this person');
  return Number(pid);
};
const saveProfile = (pid, p) => db.prepare(`INSERT INTO medical_profiles (patient_id, blood_group, allergies, conditions) VALUES (?,?,?,?)
  ON CONFLICT (patient_id) DO UPDATE SET blood_group = excluded.blood_group, allergies = excluded.allergies, conditions = excluded.conditions`)
  .run(pid, p.bloodGroup, p.allergies, p.conditions);

export const createPatientForGuardian = (gid, { name, email, passwordHash, profile }) => tx(() => {
  const u = createUser({ name, email, passwordHash, role: 'citizen' });
  db.prepare('INSERT INTO guardianships (guardian_id, patient_id) VALUES (?,?)').run(gid, u.id);
  saveProfile(u.id, profile);
  return patientCard(u.id);
});
export const updateProfile = (gid, pid, profile) => { pid = guard(gid, pid); saveProfile(pid, profile); return patientCard(pid); };
export const addReport = (gid, pid, { title, date, summary }) => {
  pid = guard(gid, pid);
  if (title.length < 2) throw new HttpError(400, 'Enter a report title');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Enter the report date');
  db.prepare('INSERT INTO medical_reports (patient_id, title, report_date, summary, created_by, created_at) VALUES (?,?,?,?,?,?)').run(pid, title, date, summary, gid, Date.now());
  return patientCard(pid);
};
export const addSampleReports = (gid, pid) => {
  pid = guard(gid, pid);
  const ago = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
  const SAMPLES = [
    ['Lipid panel blood test (sample)', ago(180), 'Total cholesterol 224 mg/dL (high), LDL 148 mg/dL, HDL 41 mg/dL. Diet changes and a statin were advised.'],
    ['ECG report (sample)', ago(90), 'Normal sinus rhythm, heart rate 78 bpm. Mild left ventricular hypertrophy. No acute changes.'],
    ['Hospital discharge summary (sample)', ago(400), 'Admitted with chest pain; heart attack ruled out. Diagnosed with hypertension and type 2 diabetes. Discharged on amlodipine and metformin.'],
  ];
  tx(() => SAMPLES.forEach(([t, d, s]) => db.prepare('INSERT INTO medical_reports (patient_id, title, report_date, summary, created_by, created_at) VALUES (?,?,?,?,?,?)').run(pid, t, d, s, gid, Date.now())));
  return patientCard(pid);
};
export const deleteReport = (gid, pid, rid) => {
  pid = guard(gid, pid);
  db.prepare('DELETE FROM medical_reports WHERE id = ? AND patient_id = ?').run(Number(rid), pid);
  return patientCard(pid);
};

// ---- AI briefing storage ----
export const markAiPending = (id) => db.prepare("UPDATE emergencies SET ai_status = 'pending' WHERE id = ?").run(Number(id));
export const saveAiSummary = (id, { status, source, summary }) => {
  db.prepare('UPDATE emergencies SET ai_status = ?, ai_source = ?, ai_summary = ?, ai_at = ? WHERE id = ?')
    .run(status, source, JSON.stringify(summary), Date.now(), Number(id));
  return getEmergency(id);
};
