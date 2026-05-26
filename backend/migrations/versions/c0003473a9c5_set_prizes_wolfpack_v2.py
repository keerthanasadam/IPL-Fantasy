"""set_prizes_wolfpack_v2

Revision ID: c0003473a9c5
Revises: 89d98b4440b0
Create Date: 2026-05-26 15:23:28.928237
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c0003473a9c5'
down_revision: Union[str, None] = '89d98b4440b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

WOLFPACK_SEASON_ID = 'f446afd3-6af7-4583-a61d-19f24852e9ff'

PRIZES = r'{"pool":1600,"first":640,"second":390,"third":245,"side_pots":[{"name":"Mellaga Kodatava Gattiga D#%$^$^","amount":75},{"name":"C/VC from second half of the draft","amount":75},{"name":"Awesome Threesome","amount":75},{"name":"picku cheppu cash kottu","amount":75}]}'
MIDSEASON_PRIZES = r'{"pool":800,"first":365,"second":240,"third":170,"side_pots":[]}'


def upgrade() -> None:
    op.execute(
        f"""
        UPDATE seasons
        SET draft_config = COALESCE(draft_config, '{{}}'::jsonb)
                        || jsonb_build_object('prizes', '{PRIZES}'::jsonb)
                        || jsonb_build_object('midseason_prizes', '{MIDSEASON_PRIZES}'::jsonb)
        WHERE id = '{WOLFPACK_SEASON_ID}'
        """
    )


def downgrade() -> None:
    op.execute(
        f"UPDATE seasons SET draft_config = draft_config - 'prizes' - 'midseason_prizes'"
        f" WHERE id = '{WOLFPACK_SEASON_ID}'"
    )
