"""usina: chave publica do peer wireguard

Revision ID: 15657af138be
Revises: c680b0c2552e
Create Date: 2026-09-14 20:58:12.223766

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '15657af138be'
down_revision: Union[str, Sequence[str], None] = 'c680b0c2552e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None



def upgrade() -> None:
    """A identidade do peer passa a ser a chave pública dele.

    A sub-rede continua na usina (é o AllowedIPs e serve de fallback enquanto
    a chave não estiver preenchida), mas deixa de ser identidade — então perde
    o unique. Duas usinas ainda não deveriam compartilhar faixa, mas isso agora
    é um problema de roteamento do gateway, não uma regra do banco.
    """
    op.add_column("usinas", sa.Column("wg_public_key", sa.String(length=44), nullable=True))
    op.create_unique_constraint("usinas_wg_public_key_key", "usinas", ["wg_public_key"])
    op.drop_constraint("usinas_subnet_cidr_key", "usinas", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint("usinas_subnet_cidr_key", "usinas", ["subnet_cidr"])
    op.drop_constraint("usinas_wg_public_key_key", "usinas", type_="unique")
    op.drop_column("usinas", "wg_public_key")
