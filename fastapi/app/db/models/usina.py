from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Usina(Base):
    __tablename__ = "usinas"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(120))
    localizacao: Mapped[str] = mapped_column(String(255), default="")

    # nome da interface WireGuard dedicada a esta usina, ex: "wg-usina1"
    wg_interface: Mapped[str] = mapped_column(String(50), unique=True)
    # sub-rede local da usina alcançada através do túnel, ex: "10.10.1.0/24"
    subnet_cidr: Mapped[str] = mapped_column(String(50))

    ativo: Mapped[bool] = mapped_column(default=True)

    equipamentos: Mapped[list["Equipamento"]] = relationship(
        back_populates="usina", cascade="all, delete-orphan"
    )
