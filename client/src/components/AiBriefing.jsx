export default function AiBriefing({ ai, compact, onRefresh }) {
  if (!ai) return null;
  if (ai.status === 'pending' || !ai.summary) return <p className="mt-2 text-sm text-slate-500">Preparing AI briefing…</p>;
  const s = ai.summary;
  return (
    <div className="mt-2 rounded-lg border border-teal-300 bg-teal-50 p-2 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-900">
        AI briefing · {{ claude: 'Claude', ollama: 'local AI (Ollama)' }[ai.source] || 'rules-based, no AI set up'} · for clinician review, not a diagnosis
      </p>
      <p className="mt-1 font-medium">{s.headline}</p>
      {s.alerts.length > 0 && <ul className="mt-1 list-disc pl-5 font-semibold text-red-800">{s.alerts.map((a, i) => <li key={i}>{a}</li>)}</ul>}
      {!compact && (<>
        {s.possibleCauses.length > 0 && (<>
          <p className="mt-2 font-semibold">Possible causes</p>
          <ul className="list-disc pl-5">{s.possibleCauses.map((c, i) => <li key={i}><b>{c.cause}</b>{c.reasoning && `: ${c.reasoning}`}</li>)}</ul>
        </>)}
        {s.history && <p className="mt-2"><b>History:</b> {s.history}</p>}
        {s.prepare.length > 0 && (<>
          <p className="mt-2 font-semibold">Suggested preparation</p>
          <ul className="list-disc pl-5">{s.prepare.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </>)}
        {onRefresh && <button onClick={onRefresh} className="mt-2 text-xs font-medium underline">Regenerate briefing</button>}
      </>)}
    </div>
  );
}
