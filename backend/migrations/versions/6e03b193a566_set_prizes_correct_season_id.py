"""set_prizes_correct_season_id

Revision ID: 6e03b193a566
Revises: 365e54953fd0
Create Date: 2026-05-26 15:53:14.176245
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '6e03b193a566'
down_revision: Union[str, None] = '365e54953fd0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Correct production season ID (from dashboard URL)
SEASON_ID = '4b8b36df-a78b-44a8-9315-1297b1884159'

PRIZES = '{"pool":1600,"first":640,"second":390,"third":245,"side_pots":[{"name":"Mellaga Kodatava Gattiga D#%$^$^","amount":75},{"name":"C/VC from second half of the draft","amount":75},{"name":"Awesome Threesome","amount":75},{"name":"picku cheppu cash kottu","amount":75}]}'
MS_PRIZES = '{"pool":800,"first":365,"second":240,"third":170,"side_pots":[]}'


def upgrade() -> None:
    conn = op.get_context().connection
    conn.exec_driver_sql(
        "UPDATE seasons "
        "SET draft_config = COALESCE(draft_config, '{}'::jsonb) "
        "    || jsonb_build_object('prizes', %s::jsonb) "
        "    || jsonb_build_object('midseason_prizes', %s::jsonb) "
        "WHERE id = %s::uuid",
        (PRIZES, MS_PRIZES, SEASON_ID),
    )


def downgrade() -> None:
    conn = op.get_context().connection
    conn.exec_driver_sql(
        "UPDATE seasons SET draft_config = draft_config - 'prizes' - 'midseason_prizes' "
        "WHERE id = %s::uuid",
        (SEASON_ID,),
    )
