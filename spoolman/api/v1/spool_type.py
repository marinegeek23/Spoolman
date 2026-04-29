"""Spool type and spool type category related endpoints."""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import Message, SpoolType, SpoolTypeCategory, SpoolTypeEvent
from spoolman.database import spool_type
from spoolman.database.database import get_db_session
from spoolman.database.utils import SortOrder
from spoolman.exceptions import ItemNotFoundError
from spoolman.ws import websocket_manager

router = APIRouter(
    prefix="/spool_type",
    tags=["spool_type"],
)

# ruff: noqa: D103


# ---------------------------------------------------------------------------
# Spool Type Category endpoints
# ---------------------------------------------------------------------------


class SpoolTypeCategoryParameters(BaseModel):
    name: str = Field(max_length=64, description="Category name.", examples=["Cardboard", "Plastic"])


@router.get(
    "/category",
    name="Find spool type categories",
    response_model_exclude_none=True,
    responses={200: {"model": list[SpoolTypeCategory]}},
)
async def find_categories(
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> JSONResponse:
    db_items = await spool_type.find_categories(db=db)
    return JSONResponse(
        content=jsonable_encoder(
            (SpoolTypeCategory.from_db(item) for item in db_items),
            exclude_none=True,
        ),
        headers={"x-total-count": str(len(db_items))},
    )


@router.post(
    "/category",
    name="Add spool type category",
    response_model_exclude_none=True,
    response_model=SpoolTypeCategory,
    responses={400: {"model": Message}},
)
async def create_category(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    body: SpoolTypeCategoryParameters,
) -> SpoolTypeCategory:
    db_item = await spool_type.create_category(db=db, name=body.name)
    return SpoolTypeCategory.from_db(db_item)


@router.delete(
    "/category/{category_id}",
    name="Delete spool type category",
    responses={404: {"model": Message}},
)
async def delete_category(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    category_id: int,
) -> Message:
    try:
        category = await spool_type.get_category_by_id(db, category_id)
        await db.delete(category)
        await db.commit()
    except ItemNotFoundError:
        return JSONResponse(status_code=404, content=Message(message=f"No spool type category with ID {category_id} found.").model_dump())
    return Message(message="Success!")


# ---------------------------------------------------------------------------
# Spool Type endpoints
# ---------------------------------------------------------------------------


class SpoolTypeParameters(BaseModel):
    vendor_id: int = Field(description="The ID of the manufacturer (vendor) for this spool type.")
    spool_type_category_id: int | None = Field(None, description="The ID of the spool type category (e.g. Cardboard, Plastic).")
    weight: float | None = Field(None, ge=0, description="Empty spool weight in grams.", examples=[200.0])
    color: str | None = Field(None, max_length=64, description="Color of the spool.", examples=["Black"])


class SpoolTypeUpdateParameters(BaseModel):
    vendor_id: int | None = Field(None, description="The ID of the manufacturer (vendor) for this spool type.")
    spool_type_category_id: int | None = Field(None, description="The ID of the spool type category.")
    weight: float | None = Field(None, ge=0, description="Empty spool weight in grams.")
    color: str | None = Field(None, max_length=64, description="Color of the spool.")

    @field_validator("vendor_id")
    @classmethod
    def prevent_none_vendor(cls: type["SpoolTypeUpdateParameters"], v: int | None) -> int | None:
        """Prevent vendor_id from being set to None via PATCH."""
        if v is None:
            raise ValueError("vendor_id must not be None.")
        return v


@router.get(
    "",
    name="Find spool types",
    response_model_exclude_none=True,
    responses={
        200: {"model": list[SpoolType]},
        299: {"model": SpoolTypeEvent, "description": "Websocket message"},
    },
)
async def find(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    vendor_id: Annotated[int | None, Query(title="Vendor ID")] = None,
    sort: Annotated[str | None, Query(title="Sort", examples=["id:asc"])] = None,
    limit: Annotated[int | None, Query(title="Limit")] = None,
    offset: Annotated[int, Query(title="Offset")] = 0,
) -> JSONResponse:
    sort_by: dict[str, SortOrder] = {}
    if sort is not None:
        for sort_item in sort.split(","):
            field, direction = sort_item.split(":")
            sort_by[field] = SortOrder[direction.upper()]

    db_items, total_count = await spool_type.find(
        db=db,
        vendor_id=vendor_id,
        sort_by=sort_by if sort_by else None,
        limit=limit,
        offset=offset,
    )
    return JSONResponse(
        content=jsonable_encoder(
            (SpoolType.from_db(item) for item in db_items),
            exclude_none=True,
        ),
        headers={"x-total-count": str(total_count)},
    )


@router.websocket("", name="Listen to spool_type changes")
async def notify_any(websocket: WebSocket) -> None:
    await websocket.accept()
    websocket_manager.connect(("spool_type",), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        websocket_manager.disconnect(("spool_type",), websocket)


@router.websocket("/{spool_type_id}", name="Listen to spool_type changes by ID")
async def notify(websocket: WebSocket, spool_type_id: int) -> None:
    await websocket.accept()
    websocket_manager.connect(("spool_type", str(spool_type_id)), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        websocket_manager.disconnect(("spool_type", str(spool_type_id)), websocket)


@router.get(
    "/{spool_type_id}",
    name="Get spool type",
    response_model_exclude_none=True,
    responses={404: {"model": Message}, 299: {"model": SpoolTypeEvent, "description": "Websocket message"}},
)
async def get(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    spool_type_id: int,
) -> SpoolType:
    db_item = await spool_type.get_by_id(db, spool_type_id)
    return SpoolType.from_db(db_item)


@router.websocket("/{spool_type_id}", name="Listen to spool_type changes")
async def notify(websocket: WebSocket, spool_type_id: int) -> None:
    await websocket.accept()
    websocket_manager.connect(("spool_type", str(spool_type_id)), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        websocket_manager.disconnect(("spool_type", str(spool_type_id)), websocket)


@router.post(
    "",
    name="Add spool type",
    response_model_exclude_none=True,
    response_model=SpoolType,
    responses={400: {"model": Message}, 404: {"model": Message}},
)
async def create(  # noqa: ANN201
    db: Annotated[AsyncSession, Depends(get_db_session)],
    body: SpoolTypeParameters,
):
    db_item = await spool_type.create(
        db=db,
        vendor_id=body.vendor_id,
        spool_type_category_id=body.spool_type_category_id,
        weight=body.weight,
        color=body.color,
    )
    return SpoolType.from_db(db_item)


@router.patch(
    "/{spool_type_id}",
    name="Update spool type",
    response_model_exclude_none=True,
    response_model=SpoolType,
    responses={400: {"model": Message}, 404: {"model": Message}},
)
async def update(  # noqa: ANN201
    db: Annotated[AsyncSession, Depends(get_db_session)],
    spool_type_id: int,
    body: SpoolTypeUpdateParameters,
):
    patch_data = body.model_dump(exclude_unset=True)
    db_item = await spool_type.update(db=db, spool_type_id=spool_type_id, data=patch_data)
    return SpoolType.from_db(db_item)


@router.delete(
    "/{spool_type_id}",
    name="Delete spool type",
    responses={404: {"model": Message}},
)
async def delete(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    spool_type_id: int,
) -> Message:
    await spool_type.delete(db, spool_type_id)
    return Message(message="Success!")
