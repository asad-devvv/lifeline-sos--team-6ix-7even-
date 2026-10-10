# LifeLine SOS

Needs Node 22.13 or newer (check with `node -v`).

    cd server && npm install && npm start      # http://localhost:4000
    cd client && npm install && npm run dev    # http://localhost:5173

Data is saved in `server/lifeline.db` (SQLite). Open it with "DB Browser for SQLite" to inspect users,
hospitals, doctors, beds and emergencies. Delete the file to reset everything.

Accounts: clients register freely. Dispatchers and crew need the staff code (default `lifeline-staff`,
change it with the LIFELINE_STAFF_CODE environment variable) and pick the hospital they work for.

Map (crew screen): Leaflet + OpenStreetMap tiles, routes from the free OSRM demo server. Needs internet. Run 'npm install' in client after updating.

Roles: Patient (one-tap SOS, can cancel right after), Guardian (creates patient accounts, keeps their medical
profile and reports), Dispatcher and Crew (staff, see the patient's medical info on each case).
Upgrading an older lifeline.db is automatic; your existing accounts are kept.

AI briefing: when a patient sends an SOS, a briefing (possible causes, safety alerts, suggested preparation) is
generated from their saved medical profile and reports, saved on the emergency in the database (columns ai_*),
and shown to the dispatcher and crew. Patients and guardians never see it.
  - Claude: set ANTHROPIC_API_KEY before starting the server. PowerShell:
        $env:ANTHROPIC_API_KEY="your-key"; npm start
    (optional: LIFELINE_AI_MODEL to change the model, default claude-sonnet-5-5)
  - No key, or the call fails: a simpler rules-based briefing is saved instead, so the hospital always gets one.
Only the incident type, the caller note and the medical profile and reports are sent. Never name, email or location.

Free local AI (Ollama): install from ollama.com, then in PowerShell run `ollama pull llama3.2`.
Start the server with:   $env:LIFELINE_AI_PROVIDER="ollama"; npm start
(optional: LIFELINE_AI_MODEL to pick another downloaded model, OLLAMA_URL if Ollama runs elsewhere)
If Ollama is not running, the rules-based briefing is saved instead.
