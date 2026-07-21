import uuid
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base

class Hazard(Base):
    __tablename__ = "hazards"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inspection_id    = Column(UUID(as_uuid=True), ForeignKey("inspections.id", ondelete="CASCADE"), nullable=False)
    category         = Column(String(100), nullable=False)
    risk_level       = Column(String(20), nullable=False)  # low / medium / high / critical
    confidence_score = Column(Float)
    description      = Column(String)
    yolo_label       = Column(String)
    ocr_text         = Column(String)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    inspection          = relationship("Inspection", back_populates="hazards")
    corrective_actions  = relationship("CorrectiveAction", back_populates="hazard", cascade="all, delete")
