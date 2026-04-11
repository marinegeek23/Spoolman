"""Helper functions for interacting with filament_type database objects."""

import logging
from datetime import datetime

import sqlalchemy
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import EventType, FilamentType, FilamentTypeEvent
from spoolman.database import models
from spoolman.database.utils import SortOrder, add_where_clause_str
from spoolman.exceptions import ItemNotFoundError
from spoolman.ws import websocket_manager

logger = logging.getLogger(__name__)


async def create(
    *,
    db: AsyncSession,
    name: str,
    density: float | None = None,
    settings_extruder_temp: int | None = None,
    settings_bed_temp: int | None = None,
    comment: str | None = None,
    extra: dict[str, str] | None = None,
) -> models.FilamentType:
    """Add a new filament type to the database."""
    filament_type = models.FilamentType(
        name=name,
        registered=datetime.utcnow().replace(microsecond=0),
        density=density,
        settings_extruder_temp=settings_extruder_temp,
        settings_bed_temp=settings_bed_temp,
        comment=comment,
        extra=[models.FilamentTypeField(key=k, value=v) for k, v in (extra or {}).items()],
    )
    db.add(filament_type)
    await db.commit()
    await filament_type_changed(filament_type, EventType.ADDED)
    return filament_type


async def get_by_id(db: AsyncSession, filament_type_id: int) -> models.FilamentType:
    """Get a filament type object from the database by the unique ID."""
    filament_type = await db.get(models.FilamentType, filament_type_id)
    if filament_type is None:
        raise ItemNotFoundError(f"No filament type with ID {filament_type_id} found.")
    return filament_type


async def find(
    *,
    db: AsyncSession,
    name: str | None = None,
    sort_by: dict[str, SortOrder] | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> tuple[list[models.FilamentType], int]:
    """Find a list of filament type objects by search criteria."""
    stmt = select(models.FilamentType)

    stmt = add_where_clause_str(stmt, models.FilamentType.name, name)

    total_count = None

    if limit is not None:
        total_count_stmt = stmt.with_only_columns(func.count(), maintain_column_froms=True)
        total_count = (await db.execute(total_count_stmt)).scalar()
        stmt = stmt.offset(offset).limit(limit)

    if sort_by is not None:
        for fieldstr, order in sort_by.items():
            field = getattr(models.FilamentType, fieldstr)
            if order == SortOrder.ASC:
                stmt = stmt.order_by(field.asc())
            elif order == SortOrder.DESC:
                stmt = stmt.order_by(field.desc())

    rows = await db.execute(stmt, execution_options={"populate_existing": True})
    result = list(rows.unique().scalars().all())
    if total_count is None:
        total_count = len(result)

    return result, total_count


async def update(
    *,
    db: AsyncSession,
    filament_type_id: int,
    data: dict,
) -> models.FilamentType:
    """Update the fields of a filament type object."""
    filament_type = await get_by_id(db, filament_type_id)
    for k, v in data.items():
        if k == "extra":
            filament_type.extra = [models.FilamentTypeField(key=ek, value=ev) for ek, ev in v.items()]
        else:
            setattr(filament_type, k, v)
    await db.commit()
    await filament_type_changed(filament_type, EventType.UPDATED)
    return filament_type


async def delete(db: AsyncSession, filament_type_id: int) -> None:
    """Delete a filament type object."""
    filament_type = await get_by_id(db, filament_type_id)
    await db.delete(filament_type)
    await filament_type_changed(filament_type, EventType.DELETED)


async def clear_extra_field(db: AsyncSession, key: str) -> None:
    """Delete all extra fields with a specific key."""
    await db.execute(
        sqlalchemy.delete(models.FilamentTypeField).where(models.FilamentTypeField.key == key),
    )


async def filament_type_changed(filament_type: models.FilamentType, typ: EventType) -> None:
    """Notify websocket clients that a filament type has changed."""
    try:
        await websocket_manager.send(
            ("filament_type", str(filament_type.id)),
            FilamentTypeEvent(
                type=typ,
                resource="filament_type",
                date=datetime.utcnow(),
                payload=FilamentType.from_db(filament_type),
            ),
        )
    except Exception:
        logger.exception("Failed to send websocket message")
