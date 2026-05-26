"""set_prizes_wolfpack

Revision ID: 89d98b4440b0
Revises: 0aed807e2336
Create Date: 2026-04-28 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '89d98b4440b0'
down_revision: Union[str, None] = '0aed807e2336'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

WOLFPACK_SEASON_ID = 'f446afd3-6af7-4583-a61d-19f24852e9ff'

PRIZES = r'{"pool":1600,"first":640,"second":390,"third":245,"side_pots":[{"name":"Mellaga Kodatava Gattiga D#%$^$^","amount":75},{"name":"C/VC from second half of the draft","amount":75},{"name":"Awesome Threesome","amount":75},{"name":"picku cheppu cash kottu","amount":75}]}'
MIDSEASON_PRIZES = r'{"pool":800,"first":365,"second":240,"third":170,"side_pots":[]}'


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE seasons "
            "SET draft_config = COALESCE(draft_config, '{}'::jsonb) "
            "                || jsonb_build_object('prizes', cast(:prizes as jsonb)) "
            "                || jsonb_build_object('midseason_prizes', cast(:ms_prizes as jsonb)) "
            "WHERE id = cast(:season_id as uuid)"
        ),
        {"prizes": PRIZES, "ms_prizes": MIDSEASON_PRIZES, "season_id": WOLFPACK_SEASON_ID},
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE seasons SET draft_config = draft_config - 'prizes' - 'midseason_prizes' "
            "WHERE id = cast(:season_id as uuid)"
        ),
        {"season_id": WOLFPACK_SEASON_ID},
    )
