"""add_display_name_unique_constraint

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-03-25 00:00:00.000000

NOTE: This migration will fail if duplicate display_names exist.
Before applying, run:
  SELECT display_name, COUNT(*) FROM users GROUP BY display_name HAVING COUNT(*) > 1;
and resolve any duplicates.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    # Deduplicate display_names by appending _2, _3, etc. to duplicates
    conn.execute(sa.text("""
        WITH ranked AS (
            SELECT id,
                   display_name,
                   ROW_NUMBER() OVER (PARTITION BY display_name ORDER BY created_at, id) AS rn
            FROM users
        )
        UPDATE users u
        SET display_name = u.display_name || '_' || r.rn
        FROM ranked r
        WHERE u.id = r.id AND r.rn > 1;
    """))
    conn.execute(sa.text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'users_display_name_unique'
            ) THEN
                ALTER TABLE users ADD CONSTRAINT users_display_name_unique UNIQUE (display_name);
            END IF;
        END$$;
    """))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_display_name_unique"))
