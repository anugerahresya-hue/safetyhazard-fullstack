# SafetyVision Backend — FastAPI

Mattel EHSS SafetyVision — AI-powered workplace hazard detection system.
Group 4, AI Class 1 — Resya A. F. (Fullstack)

---

## Tech Stack

- **FastAPI** — backend framework
- **PostgreSQL** (Supabase) — database
- **SQLAlchemy** — ORM
- **JWT** (python-jose) — authentication
- **bcrypt** (passlib) — password hashing
- **ReportLab** — PDF generator
- **httpx** — HTTP client untuk call YOLO & RAG service

---

## Setup

### 1. Clone & masuk ke folder
```bash
git clone <repo-url>
cd safetyvision-backend
```

### 2. Buat virtual environment
```bash
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Setup environment variables
```bash
cp .env.example .env
# Edit .env dan isi DATABASE_URL, SUPABASE_URL, SECRET_KEY, dll
```

### 5. Jalankan server
```bash
uvicorn app.main:app --reload
```

Server berjalan di: `http://localhost:8000`
Dokumentasi API: `http://localhost:8000/docs`

---

## Struktur Folder

```
app/
├── main.py           # entry point
├── database.py       # koneksi Supabase PostgreSQL
├── models/           # SQLAlchemy models (6 tabel)
├── routes/           # API endpoints per fitur
├── middleware/       # JWT auth & role checker
└── services/         # business logic & AI pipeline
```

---

## API Endpoints

| Method | Endpoint | Access |
|---|---|---|
| POST | /auth/register | Public |
| POST | /auth/login | Public |
| POST | /inspections | Inspector |
| POST | /inspections/{id}/analyze | Inspector |
| GET | /inspections | Inspector |
| POST | /reports/generate/{id} | Inspector |
| GET | /reports/{id}/download | Inspector, Manager |
| GET | /dashboard/stats | Manager, Admin |
| GET | /dashboard/inspections | Manager, Admin |
| GET | /admin/users | Admin |
| PATCH | /admin/users/{id}/approve | Admin |
| POST | /admin/ehss-docs | Admin |
| DELETE | /admin/users/{id} | Admin |

---

## AI Services

- **YOLO Service** (Johana) — `YOLO_SERVICE_URL` di `.env`
- **RAG Service** (Nisrina) — `RAG_SERVICE_URL` di `.env`
