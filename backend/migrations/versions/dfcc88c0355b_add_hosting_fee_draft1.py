"""add_hosting_fee_draft1

Revision ID: dfcc88c0355b
Revises: 7a84e795d49c
Create Date: 2026-05-26 16:11:01.805622
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'dfcc88c0355b'
down_revision: Union[str, None] = '7a84e795d49c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEASON_ID = '4b8b36df-a78b-44a8-9315-1297b1884159'
PRIZES = '{"pool":1650,"first":650,"second":400,"third":250,"hosting":50,"side_pots":[{"name":"Mellaga Kodatava Gattiga D#%$^$^","amount":75},{"name":"C/VC from second half of the draft","amount":75},{"name":"Awesome Threesome","amount":75},{"name":"picku cheppu cash kottu","amount":75}]}'


def upgrade() -> None:
    conn = op.get_context().connection
    conn.exec_driver_sql(
        "UPDATE seasons "
        "SET draft_config = draft_config || jsonb_build_object('prizes', %s::jsonb) "
        "WHERE id = %s::uuid",
        (PRIZES, SEASON_ID),
    )


def downgrade() -> None:
    OLD = '{"pool":1600,"first":650,"second":400,"third":250,"side_pots":[{"name":"Mellaga Kodatava Gattiga D#%$^$^","amount":75},{"name":"C/VC from second half of the draft","amount":75},{"name":"Awesome Threesome","amount":75},{"name":"picku cheppu cash kottu","amount":75}]}'
    conn = op.get_context().connection
    conn.exec_driver_sql(
        "UPDATE seasons "
        "SET draft_config = draft_config || jsonb_build_object('prizes', %s::jsonb) "
        "WHERE id = %s::uuid",
        (OLD, SEASON_ID),
    )
