import { useState } from 'react';
import { getSession, clearSession, useFeed } from './shared.jsx';
import Login from './pages/Login.jsx';
import Citizen from './pages/Citizen.jsx';
import Dispatcher from './pages/Dispatcher.jsx';
import Crew from './pages/Crew.jsx';
import Guardian from './pages/Guardian.jsx';

const VIEWS = {
  guardian: { title: 'Guardian', Page: Guardian, width: 'max-w-xl' },
  citizen: { title: 'Patient', Page: Citizen, width: 'max-w-sm' },
  dispatcher: { title: 'Hospital dispatcher', Page: Dispatcher, width: 'max-w-4xl' },
  crew: { title: 'Ambulance crew', Page: Crew, width: 'max-w-md' },
};

function Shell({ session, onLogout }) {
  const { title, Page, width } = VIEWS[session.user.role];
  const feed = useFeed(session.token);
  return (
    <main className={`mx-auto p-4 ${width}`}>
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">LifeLine</h1>
          <p className="text-sm text-slate-600">{title} · {session.user.name}</p>
        </div>
        <button onClick={onLogout} className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium shadow-sm">Sign out</button>
      </header>
      <Page {...feed} />
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState(getSession);
  if (!session?.user || !VIEWS[session.user.role]) return <Login onLogin={setSession} />;
  return <Shell session={session} onLogout={() => { clearSession(); setSession(null); }} />;
}
