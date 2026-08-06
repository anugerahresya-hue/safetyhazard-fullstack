from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from app.database import get_db
from app.models.user import User
from app.middleware.auth import hash_password, verify_password, create_access_token
from app.services import email_service

router = APIRouter()

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str
    employee_id: str | None = None
    department: str | None = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/register", status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    if body.role not in ["inspector", "manager", "admin"]:
        raise HTTPException(status_code=400, detail="Invalid role")

    user = User(
        name=body.name,
        email=body.email,
        password_hash=hash_password(body.password),
        role=body.role,
        status="pending",
        employee_id=body.employee_id,
        department=body.department,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Email tidak boleh gagalkan register kalau ada masalah kirim email
    # (Gmail API down, kredensial belum di-set, dll) — user tetap harus
    # bisa daftar, notifikasi itu bonus bukan syarat.
    try:
        email_service.send_register_user(user.email, user.name, user.role)
        admins = db.query(User).filter(User.role == "admin", User.status == "active").all()
        for admin in admins:
            email_service.send_register_admin(admin.email, user.name, user.email, user.role)
    except Exception as e:
        print(f"[EMAIL ERROR] Failed to send registration emails: {e}")

    return {"user_id": str(user.id), "message": "Account created. Waiting for Admin approval."}


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.status == "pending":
        raise HTTPException(status_code=403, detail="Account pending approval")
    if user.status == "inactive":
        raise HTTPException(status_code=403, detail="Account is inactive")

    token = create_access_token(data={"sub": user.email, "role": user.role})
    return {"access_token": token, "token_type": "bearer", "role": user.role, "name": user.name}


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    # Selalu balas sukses (jangan bocorkan email mana yang terdaftar).
    # Email reset hanya dikirim kalau user memang ada & aktif.
    user = db.query(User).filter(User.email == body.email).first()
    if user and user.status == "active":
        email_service.send_reset_password(user.email, user.name)
    return {"message": "If an account exists for that email, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    email = email_service.verify_reset_token(body.token)
    if not email:
        raise HTTPException(status_code=400, detail="Reset link is invalid or has expired")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = hash_password(body.new_password)
    db.commit()
    email_service.invalidate_reset_token(body.token)

    return {"message": "Password has been reset. You can now sign in."}
