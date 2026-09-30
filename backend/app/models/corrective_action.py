import uuid
from sqlalchemy import Column, String, Date, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base

class CorrectiveAction(Base):
    __tablename__ = "corrective_actions"

    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hazard_id          = Column(UUID(as_uuid=True), ForeignKey("hazards.id", ondelete="CASCADE"), nullable=False)
    action_description = Column(String, nullable=False)
    owner              = Column(String(255))
    due_date           = Column(Date)
    priority           = Column(String(20), default="medium")   # low / medium / high
    action_status      = Column(String(20), default="open")     # open / in_progress / closed
    created_at         = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    hazard = relationship("Hazard", back_populates="corrective_actions")
