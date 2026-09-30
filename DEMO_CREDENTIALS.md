# 🔐 Demo Credentials

**UNTUK DEMO MAGANG SAJA** — kredensial ini disediakan untuk memudahkan reviewer menguji aplikasi SafetyHazard tanpa perlu registrasi manual.

---

## Akun Demo

### 👤 Manager
**Email:** `felia@gmail.com`  
**Password:** `syasya00928`  
**Role:** Manager  
**Akses:** Dashboard analytics, view semua inspections (read-only), download reports

### 🔍 Inspector
**Email:** `resya.feliany@student.president.ac.id`  
**Password:** `resyainspector`  
**Role:** Inspector  
**Akses:** Create inspections, analyze hazards, generate reports (scoped ke inspeksi sendiri)

---

## Cara Login

### Backend API (FastAPI)
1. Jalankan backend: `cd backend && uvicorn app.main:app --reload`
2. Buka `http://localhost:8000/docs`
3. Gunakan endpoint `POST /auth/login`:
   ```json
   {
     "email": "felia@gmail.com",
     "password": "syasya00928"
   }
   ```
4. Copy `access_token` dari response untuk authenticate request lain

### Frontend (Streamlit)
1. Jalankan frontend: `cd streamlit_app && streamlit run app.py`
2. Buka `http://localhost:8501`
3. Masukkan email & password di halaman login
4. Dashboard akan muncul sesuai role (Manager = analytics, Inspector = analyzer)

---

## Role Permissions

| Feature | Inspector | Manager | Admin |
|---------|-----------|---------|-------|
| Create inspection | ✅ | ❌ | ❌ |
| Analyze hazards | ✅ (own) | ❌ | ❌ |
| Generate report | ✅ (own) | ❌ | ❌ |
| View all inspections | ❌ | ✅ | ✅ |
| Dashboard stats | ❌ | ✅ | ✅ |
| Download reports | ✅ (own) | ✅ (all) | ✅ (all) |
| User management | ❌ | ❌ | ✅ |
| EHSS docs upload | ❌ | ❌ | ✅ |

---

## Catatan Keamanan

⚠️ **JANGAN commit kredensial production** ke Git!  
File ini **hanya untuk demo** dan menggunakan akun test yang sudah dibuat di database development.

Untuk production:
- Gunakan password yang strong (min 12 karakter, kombinasi huruf/angka/simbol)
- Aktifkan 2FA jika memungkinkan
- Rotate JWT `SECRET_KEY` secara berkala
- Set `ENV=production` di `.env`
