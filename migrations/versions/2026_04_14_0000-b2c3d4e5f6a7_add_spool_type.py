"""Add spool_type and spool_type_category tables.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-14 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Perform the upgrade."""
    op.create_table(
        "spool_type_category",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("registered", sa.DateTime(), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_spool_type_category_id"), "spool_type_category", ["id"], unique=False)

    op.create_table(
        "spool_type",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("registered", sa.DateTime(), nullable=False),
        sa.Column("vendor_id", sa.Integer(), nullable=False),
        sa.Column("spool_type_category_id", sa.Integer(), nullable=True),
        sa.Column("weight", sa.Float(), nullable=True, comment="Empty spool weight in grams."),
        sa.Column("color", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendor.id"]),
        sa.ForeignKeyConstraint(["spool_type_category_id"], ["spool_type_category.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_spool_type_id"), "spool_type", ["id"], unique=False)


def downgrade() -> None:
    """Perform the downgrade."""
    op.drop_index(op.f("ix_spool_type_id"), table_name="spool_type")
    op.drop_table("spool_type")
    op.drop_index(op.f("ix_spool_type_category_id"), table_name="spool_type_category")
    op.drop_table("spool_type_category")
