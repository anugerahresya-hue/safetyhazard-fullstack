# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SafetyVision — Mattel EHSS AI-powered workplace hazard detection. Two deployable apps live in this repo:

- `backend/` — FastAPI REST API (deployed on Railway, DB + storage on Supabase)
- `streamlit_app/` — Streamlit frontend that talks to the backend over HTTP

The heavy AI work (YOLO detection, RAG corrective-action generation) runs in **two separate external services** owned by other teams, called over HTTP. This backend orchestrates them; it does not run models itself.

> Note: `backend/AGENT.md` is a detailed but partly-stale design doc. When it conflicts with the code, trust the code. Known drift: it documents `require_role(["inspector"])` (list arg) and a 7-class hazard table including raw `helmet`/`safety_vest`/`person` labels — neither matches the current implementation (see below).

## Commands

### Backend
```bash
cd backend
python -m venv venv && venv\Scripts\activate      # Windows (repo lives at C:\SafetyHazard)
pip install -r requirements.txt
cp .env.example .env                               # then fill in real values
uvicorn app.main:app --reload --port 8000          # Swagger at /docs, ReDoc at /redoc
```

### Frontend
```bash
cd streamlit_app
pip install -r requirements.txt
streamlit run app.py                               # serves on :8501
```

There is **no test suite, linter config, or migration tool** in the repo (pytest/Alembic are listed as future TODOs in `AGENT.md`). Don't assume `pytest` will find anything.

## Architecture

### AI analysis pipeline (the core flow)
`backend/app/services/ai_pipeline.py::run_full_pipeline(image_url)` is the heart of the system. Sequence:

1. **YOLO** — POST image to `{YOLO_SERVICE_URL}/detect-sahi`, get raw `detections` with `label` + `confidence_score`.
2. **Hazard derivation** — two kinds of hazards come out of the raw detections:
   - *Environmental* hazards (`ENV_HAZARD_LABELS`: `wet_floor`, `blocked_walkway`, `exposed_cable`, `chemical_spill`) — each detection is directly a hazard.
   - *PPE* hazards are **inferred, not detected**: YOLO only reports the *presence* of `helmet`/`safety_vest`. If a `person` is detected but `helmet`/`safety_vest` is absent from the detection set, the pipeline synthesizes a `no_helmet` / `no_safety_vest` hazard. This inference is the reason the severity table keys on `no_helmet`, not `helmet`.
3. **RAG** — batch-POST all hazards to `{RAG_SERVICE_URL}/rag/generate-corrective-actions`, expecting `{"actions": [{"label", "action_description"}]}`. Failure is non-fatal (falls back to a generic action).
4. **Severity** — `services/severity_rules.py::get_severity(label, confidence)` maps each label to `risk_level`/`priority`/`due_date`. Low confidence (<0.5) escalates priority and shortens the due date. Unknown labels get `DEFAULT_SEVERITY`.

Every external call degrades gracefully — OCR and RAG failures are swallowed so a partial analysis still returns. If nothing hazardous is found the pipeline returns `[]` (area is "safe").

### Request flow & persistence
`inspections.py::analyze_inspection` calls the pipeline, then writes a `Hazard` row **and** a linked `CorrectiveAction` row per result, and flips `Inspection.status` (`pending` → `analyzed` → `reported`). Reports (`reports.py`) render a PDF with ReportLab in-memory, upload it to Supabase storage, and record a `Report` row.

### Data model (`backend/app/models/`)
`User → Inspection → Hazard → CorrectiveAction`, plus `Report` (per inspection) and `EhssDocument`. UUID primary keys, PostgreSQL-specific `UUID` columns, cascade deletes down the chain. All models must be imported in `models/__init__.py` for SQLAlchemy to register them. Tables are expected to already exist — there is no migration/`create_all` step.

### Auth & roles
`middleware/auth.py`: JWT (HS256, `sub` = email), bcrypt passwords. Route protection uses `require_role(*roles)` (varargs) via the ready-made dependencies `inspector_only`, `manager_only`, `admin_only`, `manager_or_admin`. `get_current_user` additionally enforces `user.status == "active"`. Registration creates users as `pending`; an admin must approve them (`PATCH /admin/users/{id}/approve`) before login works.

Roles: **inspector** (create/analyze/report own inspections), **manager** (dashboard + all inspections, read-only), **admin** (user management + EHSS doc upload). Inspectors are scoped to their own rows; manager/admin see everything — this ownership check is repeated inline in each route, not centralized.

### Frontend structure
`streamlit_app/app.py` is the entry point and router: it does role-based sidebar nav (`NAV` dict) and dispatches to `pages_custom/*.py` (`dashboard`, `analyzer`, `reports`, `users`, `ehss_docs`). All backend access goes through `api_client.py`, which hardcodes the production URLs (`BASE_URL`, `RAG_URL`, `YOLO_URL`) and wraps every call in `safe_request` for uniform error handling. Session/token persistence is done via URL query params. `theme.py` centralizes styling.

## External integration contracts

Configured via env vars (`backend/.env`, see `.env.example`):

- `YOLO_SERVICE_URL` — endpoints used: `/detect-sahi` (batch analyze), `/detect` (live preview), `/ocr`.
- `RAG_SERVICE_URL` — endpoint: `/rag/generate-corrective-actions`. (The frontend also calls `/rag/chat` directly.)
- `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — Postgres + storage. Buckets: `inspections`, `reports`, `ehss-docs`.
- `SECRET_KEY` — JWT signing (falls back to an insecure default if unset).

Storage uploads use the **`supabase-py` client**, not raw HTTP — this is deliberate (new Supabase key formats don't work as bare `Authorization: Bearer` headers; noted in inline comments).

## Conventions & gotchas

- **Code comments and some docstrings are in Indonesian.** Match the surrounding language when editing a file.
- **Email** (`services/email_service.py`) uses the **Resend HTTPS API**, not SMTP — Railway blocks outbound SMTP ports on non-Pro plans. Requires `RESEND_API_KEY`; `MAIL_FROM` must be a Resend-verified domain. Password-reset tokens are stored in an **in-memory dict** (`reset_tokens`), so they don't survive a restart and won't work across multiple workers.
- **CORS is wide open** (`allow_origins=["*"]` in `main.py`) — intentional for dev, flagged for production hardening.
- Deployment is via `backend/Procfile` (Railway/Heroku-style: `uvicorn app.main:app`), **not** the docker-compose shown in `streamlit_app/INTEGRATION_GUIDE.md` (that file is an aspirational how-to, not the current setup).
- `.env` is gitignored; never commit real Supabase/JWT/Resend secrets.
