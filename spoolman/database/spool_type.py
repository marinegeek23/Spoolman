"""Helper functions for interacting with spool_type and spool_type_category database objects."""

import logging
from datetime import datetime

import sqlalchemy
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import EventType, SpoolType, SpoolTypeCategory, SpoolTypeEvent
from spoolman.database import models
from spoolman.database.utils import SortOrder
from spoolman.exceptions import ItemNotFoundError
from spoolman.ws import websocket_manager

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# SpoolTypeCategory helpers
# ---------------------------------------------------------------------------


async def create_category(
    *,
    db: AsyncSession,
    name: str,
) -> models.SpoolTypeCategory:
    """Add a new spool type category to the database."""
    category = models.SpoolTypeCategory(
        name=name,
        registered=datetime.utcnow().replace(microsecond=0),
    )
    db.add(category)
    await db.commit()
    return category


async def get_category_by_id(db: AsyncSession, category_id: int) -> models.SpoolTypeCategory:
    """Get a spool type category by ID."""
    category = await db.get(models.SpoolTypeCategory, category_id)
    if category is None:
        raise ItemNotFoundError(f"No spool type category with ID {category_id} found.")
    return category


async def find_categories(
    *,
    db: AsyncSession,
    sort_by: dict[str, SortOrder] | None = None,
) -> list[models.SpoolTypeCategory]:
    """Return all spool type categories."""
    stmt = select(models.SpoolTypeCategory)
    if sort_by:
        for fieldstr, order in sort_by.items():
            field = getattr(models.SpoolTypeCategory, fieldstr)
            stmt = stmt.order_by(field.asc() if order == SortOrder.ASC else field.desc())
    else:
        stmt = stmt.order_by(models.SpoolTypeCategory.name.asc())
    rows = await db.execute(stmt, execution_options={"populate_existing": True})
    return list(rows.unique().scalars().all())


# ---------------------------------------------------------------------------
# SpoolType helpers
# ---------------------------------------------------------------------------


async def create(
    *,
    db: AsyncSession,
    vendor_id: int,
    spool_type_category_id: int | None = None,
    weight: float | None = None,
    color: str | None = None,
) -> models.SpoolType:
    """Add a new spool type to the database."""
    spool_type = models.SpoolType(
        registered=datetime.utcnow().replace(microsecond=0),
        vendor_id=vendor_id,
        spool_type_category_id=spool_type_category_id,
        weight=weight,
        color=color,
    )
    db.add(spool_type)
    await db.commit()
    await spool_type_changed(spool_type, EventType.ADDED)
    return spool_type


async def get_by_id(db: AsyncSession, spool_type_id: int) -> models.SpoolType:
    """Get a spool type by ID."""
    spool_type = await db.get(models.SpoolType, spool_type_id)
    if spool_type is None:
        raise ItemNotFoundError(f"No spool type with ID {spool_type_id} found.")
    return spool_type


async def find(
    *,
    db: AsyncSession,
    vendor_id: int | None = None,
    sort_by: dict[str, SortOrder] | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> tuple[list[models.SpoolType], int]:
    """Find spool types by search criteria."""
    stmt = select(models.SpoolType)

    if vendor_id is not None:
        stmt = stmt.where(models.SpoolType.vendor_id == vendor_id)

    total_count = None
    if limit is not None:
        total_count_stmt = stmt.with_only_columns(func.count(), maintain_column_froms=True)
        total_count = (await db.execute(total_count_stmt)).scalar()
        stmt = stmt.offset(offset).limit(limit)

    if sort_by is not None:
        for fieldstr, order in sort_by.items():
            field = getattr(models.SpoolType, fieldstr)
            stmt = stmt.order_by(field.asc() if order == SortOrder.ASC else field.desc())

    rows = await db.execute(stmt, execution_options={"populate_existing": True})
    result = list(rows.unique().scalars().all())
    if total_count is None:
        total_count = len(result)

    return result, total_count


async def update(
    *,
    db: AsyncSession,
    spool_type_id: int,
    data: dict,
) -> models.SpoolType:
    """Update a spool type."""
    spool_type = await get_by_id(db, spool_type_id)
    for k, v in data.items():
        setattr(spool_type, k, v)
    await db.commit()
    await spool_type_changed(spool_type, EventType.UPDATED)
    return spool_type


async def delete(db: AsyncSession, spool_type_id: int) -> None:
    """Delete a spool type."""
    spool_type = await get_by_id(db, spool_type_id)
    await db.delete(spool_type)
    await db.commit()
    await spool_type_changed(spool_type, EventType.DELETED)


async def spool_type_changed(spool_type: models.SpoolType, typ: EventType) -> None:
    """Notify websocket clients that a spool type has changed."""
    try:
        await websocket_manager.send(
            ("spool_type", str(spool_type.id)),
            SpoolTypeEvent(
                type=typ,
                resource="spool_type",
                date=datetime.utcnow(),
                payload=SpoolType.from_db(spool_type),
            ),
        )
    except Exception:
        logger.exception("Failed to send websocket message")
