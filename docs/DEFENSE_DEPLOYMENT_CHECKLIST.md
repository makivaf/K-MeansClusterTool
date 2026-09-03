# Thesis Defense Deployment Checklist

This checklist describes the recommended local, single-machine defense setup. It is operational guidance, not a claim of ISO compliance, OWASP certification, penetration testing, or production security.

## Pre-defense

- Use the designated defense laptop and keep the API and web interface bound to `127.0.0.1`.
- Keep the seven ADNI exports only in an access-controlled local folder. Do not place them in `apps/web/public`, cloud-synced presentation folders, or Git.
- Copy `apps/api/.env.example` to an untracked `.env` only when configuration is needed. Never commit the resulting file.
- Keep the default 24-hour temporary-data retention unless the replacement is longer than the maximum queued-plus-running analysis window.
- Run `npm install`. The current API and preview commands require development packages at runtime; `npm install --omit=dev` is not supported.
- Run `npm run typecheck`, `npm run test:security -w @ad-clustering/api`, and `npm run build`.
- Start the local API with `npm start -w @ad-clustering/api`.
- Start the production frontend preview with `npm run preview -w @ad-clustering/web`.
- Open `http://127.0.0.1:5173`. Confirm `http://127.0.0.1:4000/api/health` returns only `{ "ok": true }`.
- Complete one seven-file rehearsal, confirm the new run appears in the Research run selector, and open Overview through Longitudinal Follow-Up.
- Confirm no participant rows, RID/PTID values, raw scores, or local file paths appear in the browser.
- Keep a screenshot-only presentation fallback and the previously validated aggregate result available locally.

## During the defense

- Keep both services and the browser on the defense laptop. Internet access is not required for the application workflow.
- Keep the defense browser on the local application while Vite preview is running; do not browse unrelated or untrusted sites in that session.
- Do not expose ports 4000 or 5173 through public Wi-Fi, port forwarding, tunnels, or a public URL.
- Use only the prepared, validated seven-file export set. Do not edit source code or scientific artifacts during the demonstration.
- Do not open raw CSV files, participant-level intermediate files, terminal logs, or environment files on the projected screen.
- If execution fails, use the Run Analysis retry guidance. Do not bypass validation or substitute artifacts manually.

## Post-defense

- Stop the API and frontend processes.
- Inspect and clear temporary contents under `apps/api/uploads/` and `apps/api/work/` after confirming no run is active. These paths are Git-ignored and are also subject to automated stale-data cleanup.
- Retain raw ADNI exports and participant-level research artifacts only where required by the approved research/data-use workflow; otherwise remove them from the defense laptop using the institution-approved process.
- Preserve only approved aggregate outputs needed for the thesis record.
- Review local logs for failures before deleting them; do not publish logs that contain machine paths or research metadata.

## Deployment boundaries

- `ENABLE_HSTS=true` is appropriate only behind a verified HTTPS deployment. Leave it disabled for loopback HTTP.
- A controlled private/LAN deployment requires explicit host firewall rules, `API_HOST`, `CORS_ALLOWED_ORIGINS`, TLS termination, and access control. It is not the default defense setup.
- Public internet deployment is not approved by this checklist. It additionally requires authentication/authorization decisions, paginated and rate-limited result reads, a production JavaScript hosting topology, TLS, centralized secret management, database security/retention controls, monitoring, and independent security testing.
