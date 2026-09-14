"""remove wg_interface da usina (interface unica compartilhada)

Revision ID: c680b0c2552e
Revises: f1c7b6a0e9d3
Create Date: 2026-09-14 20:44:18.229969

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c680b0c2552e'
down_revision: Union[str, Sequence[str], None] = 'f1c7b6a0e9d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None



def upgrade() -> None:
    """Uma única interface WireGuard atende todas as usinas.

    A usina deixa de carregar o nome de uma interface dedicada; o que a
    identifica dentro do túnel compartilhado passa a ser a sub-rede, que é o
    AllowedIPs do peer dela. Por isso subnet_cidr vira única.
    """
    op.drop_constraint("usinas_wg_interface_key", "usinas", type_="unique")
    op.drop_column("usinas", "wg_interface")
    op.create_unique_constraint("usinas_subnet_cidr_key", "usinas", ["subnet_cidr"])


def downgrade() -> None:
    op.drop_constraint("usinas_subnet_cidr_key", "usinas", type_="unique")
    # sem valor de origem para restaurar: nasce derivado do id para não colidir
    op.add_column(
        "usinas",
        sa.Column("wg_interface", sa.String(length=50), nullable=True),
    )
    op.execute("UPDATE usinas SET wg_interface = 'wg-' || id")
    op.alter_column("usinas", "wg_interface", nullable=False)
    op.create_unique_constraint("usinas_wg_interface_key", "usinas", ["wg_interface"])
