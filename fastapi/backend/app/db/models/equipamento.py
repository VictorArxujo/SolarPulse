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

    # Relé de proteção (Pextron URP 6100 / URP 600X): só leitura — tensão,
    # bandeirolas de proteção. Endereço próprio, pode divergir do DigiRail.
    ip_rele: Mapped[str] = mapped_column(String(45), default="")
    porta_rele: Mapped[int] = mapped_column(default=502)
    unit_id_rele: Mapped[int] = mapped_column(default=1)
    modelo_rele: Mapped[str] = mapped_column(String(30), default="URP 6100")
    registrador_status: Mapped[int] = mapped_column(default=0)

    # DigiRail (gateway Modbus TCP -> paralelismo no relé): é nele que os
    # comandos de pulso (ligar/desligar/reset) são escritos.
    ip_digirail: Mapped[str] = mapped_column(String(45), default="")
    porta_digirail: Mapped[int] = mapped_column(default=502)
    unit_id_digirail: Mapped[int] = mapped_column(default=1)
    addr_ligar: Mapped[int] = mapped_column(default=0)
    addr_desligar: Mapped[int] = mapped_column(default=0)
    addr_reset: Mapped[int] = mapped_column(default=0)

    ativo: Mapped[bool] = mapped_column(default=True)

    usina: Mapped["Usina"] = relationship(back_populates="equipamentos")
