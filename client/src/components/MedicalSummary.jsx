export default function MedicalSummary({ medical }) {
  if (!medical) return null;
  const { profile: p, reports } = medical;
  if (!p.bloodGroup && !p.allergies && !p.conditions && reports.length === 0)
    return <p className="text-sm text-slate-500">No medical information on file.</p>;
  return (
    <div className="text-sm">
      <p><b>Blood group:</b> {p.bloodGroup || 'not set'} · <b>Allergies:</b> {p.allergies || 'none listed'}</p>
      <p><b>Conditions:</b> {p.conditions || 'none listed'}</p>
      {reports.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer font-medium">Past reports ({reports.length})</summary>
          <ul className="mt-1 space-y-1">
            {reports.map((r) => <li key={r.id}><b>{r.title}</b> <span className="text-slate-500">({r.date})</span><br />{r.summary}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
