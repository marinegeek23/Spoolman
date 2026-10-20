"""AI assist API."""

import logging
from typing import Literal

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from spoolman import assist
from spoolman.api.v1.models import Message

router = APIRouter(
    prefix="/assist",
    tags=["assist"],
)

logger = logging.getLogger(__name__)


class AssistStatus(BaseModel):
    enabled: bool
    model: str


@router.get(
    "/status",
    name="Get assist status",
    response_model=AssistStatus,
)
async def status() -> AssistStatus:
    """Whether AI assist is configured on this server."""
    return AssistStatus(enabled=assist.get_api_key() is not None, model=assist.get_model())


@router.post(
    "/{task}",
    name="Look up info for a form",
    response_model=assist.AssistResponse,
    responses={400: {"model": Message}},
)
async def lookup(
    task: Literal["filament", "vendor", "filament_type", "spool_type", "spool"],
    body: assist.AssistRequest,
) -> assist.AssistResponse | JSONResponse:
    """Look something up on the web and return suggested form field values."""
    try:
        return await assist.lookup(task, body)
    except assist.AssistError as e:
        return JSONResponse(status_code=400, content=Message(message=str(e)).model_dump())
