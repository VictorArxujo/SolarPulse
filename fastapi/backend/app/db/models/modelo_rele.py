from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ModeloRele(Base):
    __tablename__ = "modelos_rele"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(50), unique=True)
    fabricante: Mapped[str] = mapped_column(String(50), default="Pextron")
