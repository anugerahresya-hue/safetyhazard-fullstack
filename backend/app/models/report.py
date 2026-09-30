import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base

class Report(Base):
    __tablename__ = "reports"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inspection_id = Column(UUID(as_uuid=True), ForeignKey("inspections.id", ondelete="CASCADE"), nullable=False)
    pdf_url       = Column(String)
    generated_at  = Column(DateTime(timezone=True), server_default=func.now())
    generated_by  = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # Relationships
    inspection    = relationship("Inspection", back_populates="reports")
    generated_by_user = relationship("User", foreign_keys=[generated_by])
