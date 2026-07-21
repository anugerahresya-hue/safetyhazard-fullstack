import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base

class Inspection(Base):
    __tablename__ = "inspections"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    location     = Column(String(255), nullable=False)
    area         = Column(String(255))
    image_url    = Column(String)
    status       = Column(String(20), default="pending")  # pending / analyzed / reported
    inspected_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user              = relationship("User", back_populates="inspections")
    hazards           = relationship("Hazard", back_populates="inspection", cascade="all, delete")
    reports           = relationship("Report", back_populates="inspection", cascade="all, delete")
