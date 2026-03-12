"""phase1_fields

Revision ID: a1b2c3d4e5f6
Revises: 69a2bd66cb61
Create Date: 2026-03-12 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '69a2bd66cb61'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('seasons', sa.Column('invite_code', sa.String(length=20), nullable=True))
    op.create_index('ix_seasons_invite_code', 'seasons', ['invite_code'], unique=True)
    op.add_column('teams', sa.Column('points', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('teams', 'points')
    op.drop_index('ix_seasons_invite_code', table_name='seasons')
    op.drop_column('seasons', 'invite_code')
    op.drop_column('users', 'is_admin')
