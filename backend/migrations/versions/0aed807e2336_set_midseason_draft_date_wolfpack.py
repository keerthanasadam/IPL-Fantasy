"""set_midseason_draft_date_wolfpack

Revision ID: 0aed807e2336
Revises: f1a2b3c4d5e6
Create Date: 2026-04-26 09:40:03.633258
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0aed807e2336'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


WOLFPACK_SEASON_ID = 'f446afd3-6af7-4583-a61d-19f24852e9ff'


def upgrade() -> None:
    op.execute(
        f"""
        UPDATE seasons
        SET draft_config = COALESCE(draft_config, '{{}}'::jsonb)
                        || '{{"midseason_draft_date": "2026-04-26"}}'::jsonb
        WHERE id = '{WOLFPACK_SEASON_ID}'
          AND (draft_config->>'midseason_draft_date') IS NULL
        """
    )


def downgrade() -> None:
    op.execute(
        f"UPDATE seasons SET draft_config = draft_config - 'midseason_draft_date'"
        f" WHERE id = '{WOLFPACK_SEASON_ID}'"
    )
