"""separa rele de protecao e digirail no equipamento, adiciona acao reset

Revision ID: 8a3f1c9d2b4e
Revises: dfacdf105881
Create Date: 2026-09-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '8a3f1c9d2b4e'
down_revision: Union[str, Sequence[str], None] = 'dfacdf105881'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('equipamentos', sa.Column('ip_rele', sa.String(length=45), nullable=False, server_default=''))
    op.add_column('equipamentos', sa.Column('porta_rele', sa.Integer(), nullable=False, server_default='502'))
    op.add_column('equipamentos', sa.Column('unit_id_rele', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('equipamentos', sa.Column('modelo_rele', sa.String(length=30), nullable=False, server_default='URP 6100'))

    op.add_column('equipamentos', sa.Column('ip_digirail', sa.String(length=45), nullable=False, server_default=''))
    op.add_column('equipamentos', sa.Column('porta_digirail', sa.Integer(), nullable=False, server_default='502'))
    op.add_column('equipamentos', sa.Column('unit_id_digirail', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('equipamentos', sa.Column('addr_ligar', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('equipamentos', sa.Column('addr_desligar', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('equipamentos', sa.Column('addr_reset', sa.Integer(), nullable=False, server_default='0'))

    # migra dados existentes: o endereço único antigo virava tanto o relé
    # quanto o digirail (mesmo device); addr_ligar herda o antigo coil_comando
    op.execute("UPDATE equipamentos SET ip_rele = ip, porta_rele = porta")
    op.execute("UPDATE equipamentos SET ip_digirail = ip, porta_digirail = porta, addr_ligar = coil_comando")

    op.drop_column('equipamentos', 'ip')
    op.drop_column('equipamentos', 'porta')
    op.drop_column('equipamentos', 'coil_comando')

    op.execute("ALTER TYPE acaocomando ADD VALUE IF NOT EXISTS 'reset'")


def downgrade() -> None:
    op.add_column('equipamentos', sa.Column('ip', sa.String(length=45), nullable=False, server_default=''))
    op.add_column('equipamentos', sa.Column('porta', sa.Integer(), nullable=False, server_default='502'))
    op.add_column('equipamentos', sa.Column('coil_comando', sa.Integer(), nullable=False, server_default='0'))

    op.execute("UPDATE equipamentos SET ip = ip_digirail, porta = porta_digirail, coil_comando = addr_ligar")

    op.drop_column('equipamentos', 'addr_reset')
    op.drop_column('equipamentos', 'addr_desligar')
    op.drop_column('equipamentos', 'addr_ligar')
    op.drop_column('equipamentos', 'unit_id_digirail')
    op.drop_column('equipamentos', 'porta_digirail')
    op.drop_column('equipamentos', 'ip_digirail')

    op.drop_column('equipamentos', 'modelo_rele')
    op.drop_column('equipamentos', 'unit_id_rele')
    op.drop_column('equipamentos', 'porta_rele')
    op.drop_column('equipamentos', 'ip_rele')
