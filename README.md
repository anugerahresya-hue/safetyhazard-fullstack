# SafetyHazard — Mattel EHSS AI Workplace Hazard Detection

**Group 4, AI Class 1 — Resya A. F. (Fullstack Developer)**

AI-powered workplace safety inspection system yang mendeteksi hazard dari foto area kerja dan menghasilkan corrective action recommendations menggunakan YOLO object detection + RAG (Retrieval-Augmented Generation).

---

## 🎯 Demo Quick Start

### Kredensial Demo
Gunakan akun berikut untuk testing:

**Manager:**
- Email: `felia@gmail.com`
- Password: `syasya00928`
- Akses: Dashboard analytics, view semua inspections

**Inspector:**
- Email: `resya.feliany@student.president.ac.id`
- Password: `resyainspector`
- Akses: Create/analyze inspections, generate reports

> 📄 Detail lengkap di [DEMO_CREDENTIALS.md](./DEMO_CREDENTIALS.md)

---

## 🏗️ Arsitektur

Repo ini berisi **2 aplikasi deployable**:

### 1. Backend (FastAPI)
- **Lokasi:** `backend/`
- **Tech:** FastAPI, PostgreSQL (Supabase), SQLAlchemy, JWT auth
- **Deployment:** Railway
- **Port:** 8000
- **Docs:** `/docs` (Swagger), `/redoc` (ReDoc)

### 2. Frontend (Streamlit)
- **Lokasi:** `streamlit_app/`
- **Tech:** Streamlit, requests
- **Port:** 8501
- **UI:** Role-based dashboard (Inspector/Manager/Admin)

### External AI Services
Backend **tidak menjalankan model AI sendiri**, tapi orchestrate 2 external services:
- **YOLO Service** (Computer Vision) — deteksi hazard dari gambar
- **RAG Service** (NLP) — generate corrective actions dari knowledge base EHSS

---

## 🚀 Setup & Run

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows (Mac/Linux: source venv/bin/activate)
pip install -r requirements.txt
cp .env.example .env           # Edit .env dengan kredensial Supabase, JWT key, dll
uvicorn app.main:app --reload --port 8000
```

**Akses:**
- API: http://localhost:8000
- Swagger Docs: http://localhost:8000/docs

### Frontend
```bash
cd streamlit_app
pip install -r requirements.txt
streamlit run app.py
```

**Akses:** http://localhost:8501

---

## 📦 Tech Stack

### Backend
- **FastAPI** — REST API framework
- **PostgreSQL** — database (Supabase)
- **SQLAlchemy** — ORM
- **JWT** (python-jose) — authentication
- **bcrypt** (passlib) — password hashing
- **ReportLab** — PDF report generator
- **httpx** — HTTP client untuk call YOLO & RAG services
- **Resend** — email service (HTTPS API, karena Railway blokir SMTP)

### Frontend
- **Streamlit** — web UI framework
- **requests** — HTTP client ke backend
- **Pillow** — image processing

---

## 🔑 Environment Variables

Buat file `backend/.env` berdasarkan `.env.example`:

```bash
# Database & Storage
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
SUPABASE_URL=https://[PROJECT-REF].supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT
SECRET_KEY=ganti-dengan-random-string-minimal-32-karakter
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# AI Services
YOLO_SERVICE_URL=https://computer-vision-safety-hazard-production.up.railway.app
RAG_SERVICE_URL=https://mattel-ehss-rag-production.up.railway.app

# Email (opsional untuk forgot password)
RESEND_API_KEY=your-resend-api-key
MAIL_FROM=noreply@your-domain.com

# Environment
ENV=development
```

> ⚠️ **JANGAN commit file `.env` ke Git!** File ini sudah ada di `.gitignore`.

---

## 🎯 Fitur Utama

### Inspector Role
- Upload foto area kerja
- AI analyze hazard (deteksi PPE, environmental hazards)
- Generate PDF report dengan corrective actions
- View history inspeksi sendiri

### Manager Role
- Dashboard analytics (total inspections, high-priority hazards, trends)
- View semua inspections dari semua inspector
- Download reports

### Admin Role
- User management (approve/reject registrations, delete users)
- Upload EHSS documents untuk RAG knowledge base
- Semua akses Manager

---

## 📊 Data Model

```
User (inspector/manager/admin)
  ↓ 1:N
Inspection (location, timestamp, status)
  ↓ 1:N
Hazard (label, confidence, severity, risk_level)
  ↓ 1:1
CorrectiveAction (description, priority, due_date)

Report (PDF metadata, link ke Inspection)
EhssDocument (knowledge base untuk RAG)
```

---

## 🧪 API Endpoints

| Method | Endpoint | Role | Deskripsi |
|--------|----------|------|-----------|
| POST | `/auth/register` | Public | Registrasi user baru (status: pending) |
| POST | `/auth/login` | Public | Login & dapat JWT token |
| POST | `/inspections` | Inspector | Create inspection baru |
| POST | `/inspections/{id}/analyze` | Inspector | Analyze foto dengan AI pipeline |
| GET | `/inspections` | Inspector | List inspeksi sendiri |
| POST | `/reports/generate/{id}` | Inspector | Generate PDF report |
| GET | `/reports/{id}/download` | Inspector/Manager | Download PDF |
| GET | `/dashboard/stats` | Manager/Admin | Statistics & trends |
| GET | `/dashboard/inspections` | Manager/Admin | All inspections |
| PATCH | `/admin/users/{id}/approve` | Admin | Approve pending user |
| DELETE | `/admin/users/{id}` | Admin | Delete user |
| POST | `/admin/ehss-docs` | Admin | Upload EHSS document |

---

## 🤖 AI Pipeline Flow

1. **Upload foto** → Backend menerima image file
2. **YOLO Detection** → POST ke external YOLO service, deteksi:
   - PPE: `helmet`, `safety_vest`, `person`
   - Environmental: `wet_floor`, `blocked_walkway`, `exposed_cable`, `chemical_spill`
3. **Hazard Inference** → Jika ada `person` tapi tidak ada `helmet`/`safety_vest` → synthesize hazard `no_helmet`/`no_safety_vest`
4. **RAG Generation** → POST semua hazards ke RAG service, dapatkan corrective actions
5. **Severity Mapping** → Assign risk level, priority, due date berdasarkan confidence & label
6. **Persist** → Simpan ke database (Inspection → Hazard → CorrectiveAction)
7. **Report** → Generate PDF dengan ReportLab, upload ke Supabase Storage

---

## 📝 Dokumentasi Tambahan

- **[CLAUDE.md](./CLAUDE.md)** — Detailed system architecture & conventions untuk AI assistant
- **[backend/AGENT.md](./backend/AGENT.md)** — Design doc (sebagian outdated, prioritaskan kode aktual)
- **[DEMO_CREDENTIALS.md](./DEMO_CREDENTIALS.md)** — Kredensial untuk testing demo

---

## 🚨 Known Limitations

- **No test suite** — pytest/Alembic belum diimplementasi
- **No DB migrations** — tabel harus sudah exist di Supabase sebelum run
- **Password reset tokens in-memory** — hilang saat restart server
- **CORS wide open** (`allow_origins=["*"]`) — OK untuk dev, harus di-harden untuk production
- **No frontend .env** — URL backend/YOLO/RAG hardcoded di `api_client.py`

---

## 👥 Team

**Group 4 — AI Class 1:**
- **Resya A. F.** — Fullstack Developer (Backend + Frontend integration)
- **Johana** — Computer Vision (YOLO Service)
- **Nisrina** — NLP (RAG Service)

---

## 📄 License

Project ini dibuat untuk keperluan akademik (Capstone Project AI Class 1) dan demo magang.
