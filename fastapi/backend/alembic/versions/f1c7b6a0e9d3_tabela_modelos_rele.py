"""cria tabela modelos_rele e migra equipamentos.modelo_rele para FK

Revision ID: f1c7b6a0e9d3
Revises: 8a3f1c9d2b4e
Create Date: 2026-09-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f1c7b6a0e9d3'
down_revision: Union[str, Sequence[str], None] = '8a3f1c9d2b4e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'modelos_rele',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nome', sa.String(length=50), nullable=False),
        sa.Column('fabricante', sa.String(length=50), nullable=False, server_default='Pextron'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('nome'),
    )

    # semeia os modelos já usados nos dados existentes (e os dois conhecidos
    # do domínio, mesmo que ainda não estejam em uso)
    op.execute(
        "INSERT INTO modelos_rele (nome, fabricante) VALUES "
        "('URP 6100', 'Pextron'), ('URP 600X', 'Pextron') "
        "ON CONFLICT (nome) DO NOTHING"
    )

    op.add_column('equipamentos', sa.Column('modelo_rele_id', sa.Integer(), nullable=True))
    op.execute(
        "UPDATE equipamentos SET modelo_rele_id = "
        "(SELECT id FROM modelos_rele WHERE modelos_rele.nome = equipamentos.modelo_rele)"
    )
    # sobra sem casar (nome não previsto) -> cai no primeiro modelo cadastrado
    op.execute(
        "UPDATE equipamentos SET modelo_rele_id = (SELECT id FROM modelos_rele ORDER BY id LIMIT 1) "
        "WHERE modelo_rele_id IS NULL"
    )
    op.alter_column('equipamentos', 'modelo_rele_id', nullable=False)
    op.create_foreign_key(
        'fk_equipamentos_modelo_rele', 'equipamentos', 'modelos_rele', ['modelo_rele_id'], ['id']
    )
    op.drop_column('equipamentos', 'modelo_rele')


def downgrade() -> None:
    op.add_column('equipamentos', sa.Column('modelo_rele', sa.String(length=30), nullable=False, server_default='URP 6100'))
    op.execute(
        "UPDATE equipamentos SET modelo_rele = "
        "(SELECT nome FROM modelos_rele WHERE modelos_rele.id = equipamentos.modelo_rele_id)"
    )
    op.drop_constraint('fk_equipamentos_modelo_rele', 'equipamentos', type_='foreignkey')
    op.drop_column('equipamentos', 'modelo_rele_id')
    op.drop_table('modelos_rele')
