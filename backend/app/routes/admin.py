from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.middleware.auth import admin_only
from app.models.user import User

router = APIRouter()

class ApproveRequest(BaseModel):
    status: str  # active / inactive

@router.get("/users")
def list_users(current_user = Depends(admin_only), db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [
        {
            "id": str(u.id),
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "status": u.status,
            "created_at": str(u.created_at),
        }
        for u in users
    ]

@router.patch("/users/{user_id}/approve")
def approve_user(
    user_id: str,
    body: ApproveRequest,
    current_user = Depends(admin_only),
    db: Session = Depends(get_db)
):
    if body.status not in ["active", "inactive"]:
        raise HTTPException(status_code=400, detail="Status must be active or inactive")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.status = body.status
    db.commit()

    return {"message": f"User {body.status} successfully", "user_id": user_id}

@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    current_user = Depends(admin_only),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()
    return {"message": "User deleted successfully"}

# TODO Sprint 2: tambah endpoint upload EHSS docs
# POST /admin/ehss-docs
