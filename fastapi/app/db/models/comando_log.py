import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class AcaoComando(str, enum.Enum):
    religar = "religar"
    abrir = "abrir"


class ComandoLog(Base):
    __tablename__ = "comando_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    equipamento_id: Mapped[int] = mapped_column(ForeignKey("equipamentos.id"))

    acao: Mapped[AcaoComando] = mapped_column(Enum(AcaoComando))
    sucesso: Mapped[bool] = mapped_column(default=False)
    detalhe: Mapped[str] = mapped_column(String(255), default="")

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    usuario: Mapped["Usuario"] = relationship()
    equipamento: Mapped["Equipamento"] = relationship()
