import enum

from sqlalchemy import Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RoleUsuario(str, enum.Enum):
    admin = "admin"
    operador = "operador"


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[RoleUsuario] = mapped_column(
        Enum(RoleUsuario), default=RoleUsuario.operador
    )
    ativo: Mapped[bool] = mapped_column(default=True)
