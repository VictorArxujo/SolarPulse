import enum

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TipoEquipamento(str, enum.Enum):
    religador = "religador"
    disjuntor = "disjuntor"
    outro = "outro"


class Equipamento(Base):
    __tablename__ = "equipamentos"

    id: Mapped[int] = mapped_column(primary_key=True)
    usina_id: Mapped[int] = mapped_column(ForeignKey("usinas.id"))

    nome: Mapped[str] = mapped_column(String(120))
    tipo: Mapped[TipoEquipamento] = mapped_column(
        Enum(TipoEquipamento), default=TipoEquipamento.religador
    )

    # endereço alcançado pelo container através do túnel WireGuard da usina
    ip: Mapped[str] = mapped_column(String(45))
    porta: Mapped[int] = mapped_column(default=502)  # porta padrão Modbus TCP

    # endereços Modbus usados para ler status e comandar o equipamento
    coil_comando: Mapped[int] = mapped_column(default=0)
    registrador_status: Mapped[int] = mapped_column(default=0)

    ativo: Mapped[bool] = mapped_column(default=True)

    usina: Mapped["Usina"] = relationship(back_populates="equipamentos")