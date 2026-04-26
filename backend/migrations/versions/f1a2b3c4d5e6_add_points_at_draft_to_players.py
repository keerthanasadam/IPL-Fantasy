"""add_points_at_draft_to_players

Revision ID: f1a2b3c4d5e6
Revises: c98983145062
Create Date: 2026-04-25 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'c98983145062'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS points_at_draft NUMERIC(10, 2) DEFAULT NULL"
    ))


def downgrade() -> None:
    op.drop_column('players', 'points_at_draft')
