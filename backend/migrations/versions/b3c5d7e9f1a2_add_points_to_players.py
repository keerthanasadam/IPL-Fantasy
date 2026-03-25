"""add_points_to_players

Revision ID: b3c5d7e9f1a2
Revises: 14e1406a0a34
Create Date: 2026-03-25 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3c5d7e9f1a2'
down_revision: Union[str, None] = '14e1406a0a34'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE players ADD COLUMN IF NOT EXISTS points NUMERIC(10, 2) DEFAULT 0"))


def downgrade() -> None:
    op.drop_column('players', 'points')
