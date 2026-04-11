"""Add filament_type table.

Revision ID: a1b2c3d4e5f6
Revises: 415a8f855e14
Create Date: 2026-04-11 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "415a8f855e14"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Perform the upgrade."""
    op.create_table(
        "filament_type",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("registered", sa.DateTime(), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("density", sa.Float(), nullable=True, comment="Default density in g/cm³."),
        sa.Column("settings_extruder_temp", sa.Integer(), nullable=True, comment="Default extruder temperature."),
        sa.Column("settings_bed_temp", sa.Integer(), nullable=True, comment="Default bed temperature."),
        sa.Column("comment", sa.String(length=1024), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_filament_type_id"), "filament_type", ["id"], unique=False)

    op.create_table(
        "filament_type_field",
        sa.Column("filament_type_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["filament_type_id"], ["filament_type.id"]),
        sa.PrimaryKeyConstraint("filament_type_id", "key"),
    )
    op.create_index(op.f("ix_filament_type_field_filament_type_id"), "filament_type_field", ["filament_type_id"], unique=False)
    op.create_index(op.f("ix_filament_type_field_key"), "filament_type_field", ["key"], unique=False)


def downgrade() -> None:
    """Perform the downgrade."""
    op.drop_index(op.f("ix_filament_type_field_key"), table_name="filament_type_field")
    op.drop_index(op.f("ix_filament_type_field_filament_type_id"), table_name="filament_type_field")
    op.drop_table("filament_type_field")
    op.drop_index(op.f("ix_filament_type_id"), table_name="filament_type")
    op.drop_table("filament_type")
