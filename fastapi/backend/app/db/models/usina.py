from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Usina(Base):
    __tablename__ = "usinas"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(120))
    localizacao: Mapped[str] = mapped_column(String(255), default="")

    # Sub-rede local da usina alcançada pelo túnel, ex: "10.10.1.0/24".
    # É também o AllowedIPs do peer desta usina, e é por ela que o status do
    # túnel encontra o peer certo dentro da interface compartilhada.
    subnet_cidr: Mapped[str] = mapped_column(String(50))

    # Chave pública do peer desta usina na interface compartilhada. É a
    # identidade real do peer — o `wg` indexa tudo por ela. Opcional: enquanto
    # estiver vazia, o status do túnel cai no casamento por AllowedIPs.
    wg_public_key: Mapped[str | None] = mapped_column(String(44), unique=True, default=None)

    ativo: Mapped[bool] = mapped_column(default=True)

    equipamentos: Mapped[list["Equipamento"]] = relationship(
        back_populates="usina", cascade="all, delete-orphan"
    )
