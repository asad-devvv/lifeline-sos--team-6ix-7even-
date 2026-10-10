const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cell = (k, v) => (v != null && (k.endsWith('_at') || k === 'at') && typeof v === 'number' ? new Date(v).toLocaleString() : v);

export const debugPage = (tables) => `<!doctype html><meta charset="utf-8"><title>LifeLine database</title>
<style>body{font:14px system-ui;margin:20px;background:#f1f5f9;color:#0f172a}h2{margin:24px 0 6px}
table{border-collapse:collapse;background:#fff}td,th{border:1px solid #cbd5e1;padding:4px 8px;text-align:left;vertical-align:top;max-width:340px;word-break:break-word}
th{background:#e2e8f0}</style>
<h1>LifeLine database <small style="font-weight:400">(read-only, press F5 to refresh)</small></h1>
${Object.entries(tables).map(([name, rows]) => `<h2>${esc(name)} (${rows.length})</h2>` + (rows.length
  ? `<table><tr>${Object.keys(rows[0]).map((k) => `<th>${esc(k)}</th>`).join('')}</tr>${rows
      .map((r) => `<tr>${Object.entries(r).map(([k, v]) => `<td>${esc(cell(k, v))}</td>`).join('')}</tr>`).join('')}</table>`
  : '<p>No rows yet.</p>')).join('')}`;
