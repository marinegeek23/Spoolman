"""Filament type related endpoints."""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import FilamentType, FilamentTypeEvent, Message
from spoolman.database import filament_type
from spoolman.database.database import get_db_session
from spoolman.database.utils import SortOrder
from spoolman.extra_fields import EntityType, get_extra_fields, validate_extra_field_dict
from spoolman.ws import websocket_manager

router = APIRouter(
    prefix="/filament_type",
    tags=["filament_type"],
)

# ruff: noqa: D103


class FilamentTypeParameters(BaseModel):
    name: str = Field(max_length=64, description="Filament type name.", examples=["PLA"])
    density: float | None = Field(None, ge=0, description="Default density in g/cm³.", examples=[1.24])
    settings_extruder_temp: int | None = Field(None, ge=0, description="Default extruder temperature in °C.", examples=[210])
    settings_bed_temp: int | None = Field(None, ge=0, description="Default bed temperature in °C.", examples=[60])
    comment: str | None = Field(None, max_length=1024, description="Free text comment.")
    extra: dict[str, str] | None = Field(None, description="Extra fields for this filament type.")


class FilamentTypeUpdateParameters(FilamentTypeParameters):
    name: str | None = Field(None, max_length=64, description="Filament type name.", examples=["PLA"])

    @field_validator("name")
    @classmethod
    def prevent_none(cls: type["FilamentTypeUpdateParameters"], v: str | None) -> str | None:
        """Prevent name from being None."""
        if v is None:
            raise ValueError("Value must not be None.")
        return v


@router.get(
    "",
    name="Find filament type",
    response_model_exclude_none=True,
    responses={
        200: {"model": list[FilamentType]},
        299: {"model": FilamentTypeEvent, "description": "Websocket message"},
    },
)
async def find(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    name: Annotated[str | None, Query(title="Filament Type Name")] = None,
    sort: Annotated[str | None, Query(title="Sort", examples=["name:asc,id:desc"])] = None,
    limit: Annotated[int | None, Query(title="Limit")] = None,
    offset: Annotated[int, Query(title="Offset")] = 0,
) -> JSONResponse:
    sort_by: dict[str, SortOrder] = {}
    if sort is not None:
        for sort_item in sort.split(","):
            field, direction = sort_item.split(":")
            sort_by[field] = SortOrder[direction.upper()]

    db_items, total_count = await filament_type.find(
        db=db,
        name=name,
        sort_by=sort_by,
        limit=limit,
        offset=offset,
    )
    return JSONResponse(
        content=jsonable_encoder(
            (FilamentType.from_db(db_item) for db_item in db_items),
            exclude_none=True,
        ),
        headers={"x-total-count": str(total_count)},
    )


@router.websocket("", name="Listen to filament_type changes")
async def notify_any(websocket: WebSocket) -> None:
    await websocket.accept()
    websocket_manager.connect(("filament_type",), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        websocket_manager.disconnect(("filament_type",), websocket)


@router.get(
    "/{filament_type_id}",
    name="Get filament type",
    response_model_exclude_none=True,
    responses={404: {"model": Message}, 299: {"model": FilamentTypeEvent, "description": "Websocket message"}},
)
async def get(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    filament_type_id: int,
) -> FilamentType:
    db_item = await filament_type.get_by_id(db, filament_type_id)
    return FilamentType.from_db(db_item)


@router.websocket("/{filament_type_id}", name="Listen to filament_type changes")
async def notify(websocket: WebSocket, filament_type_id: int) -> None:
    await websocket.accept()
    websocket_manager.connect(("filament_type", str(filament_type_id)), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        websocket_manager.disconnect(("filament_type", str(filament_type_id)), websocket)


@router.post(
    "",
    name="Add filament type",
    response_model_exclude_none=True,
    response_model=FilamentType,
    responses={400: {"model": Message}},
)
async def create(  # noqa: ANN201
    db: Annotated[AsyncSession, Depends(get_db_session)],
    body: FilamentTypeParameters,
):
    if body.extra:
        all_fields = await get_extra_fields(db, EntityType.filament_type)
        try:
            validate_extra_field_dict(all_fields, body.extra)
        except ValueError as e:
            return JSONResponse(status_code=400, content=Message(message=str(e)).model_dump())

    db_item = await filament_type.create(
        db=db,
        name=body.name,
        density=body.density,
        settings_extruder_temp=body.settings_extruder_temp,
        settings_bed_temp=body.settings_bed_temp,
        comment=body.comment,
        extra=body.extra,
    )
    return FilamentType.from_db(db_item)


@router.patch(
    "/{filament_type_id}",
    name="Update filament type",
    response_model_exclude_none=True,
    response_model=FilamentType,
    responses={400: {"model": Message}, 404: {"model": Message}},
)
async def update(  # noqa: ANN201
    db: Annotated[AsyncSession, Depends(get_db_session)],
    filament_type_id: int,
    body: FilamentTypeUpdateParameters,
):
    patch_data = body.model_dump(exclude_unset=True)

    if body.extra:
        all_fields = await get_extra_fields(db, EntityType.filament_type)
        try:
            validate_extra_field_dict(all_fields, body.extra)
        except ValueError as e:
            return JSONResponse(status_code=400, content=Message(message=str(e)).model_dump())

    db_item = await filament_type.update(
        db=db,
        filament_type_id=filament_type_id,
        data=patch_data,
    )
    return FilamentType.from_db(db_item)


@router.delete(
    "/{filament_type_id}",
    name="Delete filament type",
    responses={404: {"model": Message}},
)
async def delete(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    filament_type_id: int,
) -> Message:
    await filament_type.delete(db, filament_type_id)
    return Message(message="Success!")
