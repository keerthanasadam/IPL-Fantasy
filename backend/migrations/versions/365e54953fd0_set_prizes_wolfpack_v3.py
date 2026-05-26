"""set_prizes_wolfpack_v3

Revision ID: 365e54953fd0
Revises: c0003473a9c5
Create Date: 2026-05-26 15:42:58.742072
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '365e54953fd0'
down_revision: Union[str, None] = 'c0003473a9c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

WOLFPACK_SEASON_ID = 'f446afd3-6af7-4583-a61d-19f24852e9ff'


PRIZES_JSON = '{"pool":1600,"first":640,"second":390,"third":245,"side_pots":[{"name":"Mellaga Kodatava Gattiga D#%$^$^","amount":75},{"name":"C/VC from second half of the draft","amount":75},{"name":"Awesome Threesome","amount":75},{"name":"picku cheppu cash kottu","amount":75}]}'
MS_PRIZES_JSON = '{"pool":800,"first":365,"second":240,"third":170,"side_pots":[]}'


def upgrade() -> None:
    # exec_driver_sql sends SQL directly to psycopg2 with %s params — bypasses
    # SQLAlchemy's :name and sa.DDL() %s format processing entirely.
    conn = op.get_context().connection
    conn.exec_driver_sql(
        "UPDATE seasons "
        "SET draft_config = COALESCE(draft_config, '{}'::jsonb) "
        "    || jsonb_build_object('prizes', %s::jsonb) "
        "    || jsonb_build_object('midseason_prizes', %s::jsonb) "
        "WHERE id = %s::uuid",
        (PRIZES_JSON, MS_PRIZES_JSON, WOLFPACK_SEASON_ID),
    )


def downgrade() -> None:
    conn = op.get_context().connection
    conn.exec_driver_sql(
        "UPDATE seasons SET draft_config = draft_config - 'prizes' - 'midseason_prizes' "
        "WHERE id = %s::uuid",
        (WOLFPACK_SEASON_ID,),
    )
