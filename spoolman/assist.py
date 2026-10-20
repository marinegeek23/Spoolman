"""AI assist: look up filament information on the web with Claude and return form field suggestions."""

import json
import logging
import os
import re
from typing import Any

import anthropic
from anthropic.types.beta import BetaMessage
from pydantic import BaseModel, Field

from spoolman.externaldb import get_filaments_file

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-opus-5-5"
DEFAULT_EFFORT = "low"
DEFAULT_MAX_SEARCHES = 3
MIN_CANDIDATE_OVERLAP = 2

# Models that accept the server-side refusal fallback (`fallbacks: "default"`).
FALLBACK_MODELS = {"claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"}


def get_api_key() -> str | None:
    """Get the Anthropic API key, or None if assist is disabled."""
    return os.getenv("ANTHROPIC_API_KEY") or None


def get_model() -> str:
    """Get the Claude model used for assist."""
    return os.getenv("SPOOLMAN_ASSIST_MODEL", DEFAULT_MODEL)


def get_effort() -> str:
    """Get the effort level used for assist."""
    return os.getenv("SPOOLMAN_ASSIST_EFFORT", DEFAULT_EFFORT)


def get_max_searches() -> int:
    """Get the max number of web searches per lookup."""
    return int(os.getenv("SPOOLMAN_ASSIST_MAX_SEARCHES", str(DEFAULT_MAX_SEARCHES)))


def _nullable(schema: dict[str, Any]) -> dict[str, Any]:
    return {"anyOf": [schema, {"type": "null"}]}


FILAMENT_FIELDS: dict[str, dict[str, Any]] = {
    "vendor": _nullable({"type": "string"}),
    "name": _nullable({"type": "string"}),
    "material": _nullable({"type": "string"}),
    "density": _nullable({"type": "number"}),
    "diameter": _nullable({"type": "number"}),
    "weight": _nullable({"type": "number"}),
    "spool_weight": _nullable({"type": "number"}),
    "price": _nullable({"type": "number"}),
    "settings_extruder_temp": _nullable({"type": "integer"}),
    "settings_bed_temp": _nullable({"type": "integer"}),
    "color_hex": _nullable({"type": "string"}),
    "color_hexes": _nullable({"type": "array", "items": {"type": "string"}}),
    "multi_color_direction": _nullable({"type": "string", "enum": ["coaxial", "longitudinal"]}),
}

FILAMENT_SCHEMA = {
    "type": "object",
    "properties": {
        "fields": {
            "type": "object",
            "properties": FILAMENT_FIELDS,
            "required": list(FILAMENT_FIELDS),
            "additionalProperties": False,
        },
        "notes": {"type": "string"},
        "sources": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"title": {"type": "string"}, "url": {"type": "string"}},
                "required": ["title", "url"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["fields", "notes", "sources"],
    "additionalProperties": False,
}

FILAMENT_SYSTEM = """\
You help fill in a 3D printing filament inventory form (Spoolman). Given a description of a filament \
(vendor, product name, color, maybe a product URL) and the current form values, find accurate specs and \
return them as structured field values. A human will review every value before saving.

Rules:
- Prefer the manufacturer's own product page or technical data sheet. Retailer listings are the next best.
- Candidates from SpoolmanDB (a curated community database) are provided when they look relevant; trust them \
when they clearly match the product, and only search the web for what they don't cover.
- Return null for anything you cannot find or reasonably determine. Never invent prices.
- Generic material defaults are acceptable for density and diameter (e.g. PLA 1.24, PETG 1.27, ABS 1.04, \
ASA 1.07, TPU 1.21; 1.75 mm) when the product doesn't state them.
- Temperatures: use a single recommended value in °C; if a range is given, pick the midpoint rounded to 5.
- weight is the net filament weight of a full spool in grams; spool_weight is the empty spool in grams.
- price is the typical current price of one spool in the user's currency; null if unclear.
- color_hex is a 6-digit hex without "#" for single-color filaments. For multi-color filaments (dual/tri \
color, coextruded, gradient) set color_hexes instead, leave color_hex null, and set multi_color_direction \
("coaxial" for dual/tri-color coextruded, "longitudinal" for gradient/rainbow along the length).
- material must be one of the user's existing material types when one fits (list provided); otherwise the \
plain material name.
- vendor should be the manufacturer's brand name; match the spelling of an existing vendor when it's the same brand.
- name follows the user's convention: "<Vendor> <Material> <Color>", e.g. "Sunlu PLA+ White", \
"Reprapper PLA Silk Gold", "TinMorry PETG Metallic Blue".
- Leave a field null when the current form value is already correct; only suggest values that add or fix \
something.
- notes: one or two short sentences on what you found and anything uncertain. sources: the pages you used.
"""


class FilamentAssistRequest(BaseModel):
    query: str = Field(description="Free-text description of the filament, or a product URL.")
    current: dict[str, Any] = Field(default_factory=dict, description="Current form values.")
    vendors: list[str] = Field(default_factory=list, description="Existing vendor names.")
    materials: list[str] = Field(default_factory=list, description="Existing material type names.")
    currency: str = Field(default="USD", description="The user's currency code.")


class AssistSource(BaseModel):
    title: str
    url: str


class FilamentAssistResponse(BaseModel):
    fields: dict[str, Any] = Field(description="Suggested field values; null means no suggestion.")
    notes: str
    sources: list[AssistSource]
    model: str
    input_tokens: int
    output_tokens: int
    web_searches: int


class AssistError(Exception):
    """Assist lookup failed in a way the user should see."""


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9+]+", text.lower()))


def find_spoolmandb_candidates(query: str, limit: int = 5) -> list[dict[str, Any]]:
    """Find SpoolmanDB filaments that share the most words with the query."""
    try:
        filaments = json.loads(get_filaments_file().read_text())
    except Exception:
        logger.exception("Failed to read SpoolmanDB filaments file.")
        return []

    query_tokens = _tokens(query)
    if not query_tokens:
        return []

    scored = []
    for item in filaments:
        item_text = f"{item.get('manufacturer', '')} {item.get('name', '')} {item.get('material', '')}"
        overlap = len(query_tokens & _tokens(item_text))
        if overlap >= MIN_CANDIDATE_OVERLAP:
            scored.append((overlap, item))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [item for _, item in scored[:limit]]


def _build_user_message(req: FilamentAssistRequest, candidates: list[dict[str, Any]]) -> str:
    current = {k: v for k, v in req.current.items() if v not in (None, "", [])}
    parts = [
        f"Filament to look up: {req.query}",
        f"Current form values: {json.dumps(current)}",
        f"User's currency: {req.currency}",
        f"Existing material types: {', '.join(req.materials) or '(none)'}",
        f"Existing vendors: {', '.join(req.vendors) or '(none)'}",
    ]
    if candidates:
        parts.append(f"SpoolmanDB candidates: {json.dumps(candidates)}")
    else:
        parts.append("SpoolmanDB candidates: none matched.")
    return "\n\n".join(parts)


def _parse_result(response: BetaMessage) -> dict[str, Any]:
    """Extract the structured JSON result from the final response."""
    if response.stop_reason == "refusal":
        raise AssistError("The model declined this request.")
    if response.stop_reason == "max_tokens":
        raise AssistError("The response was cut off; try a more specific query.")

    text = next((b.text for b in reversed(response.content) if b.type == "text"), None)
    if text is None:
        raise AssistError("The model returned no result.")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        logger.exception("Assist returned invalid JSON: %s", text)
        raise AssistError("The model returned an invalid result.") from e
    return data


async def lookup_filament(req: FilamentAssistRequest) -> FilamentAssistResponse:
    """Look up filament info and return suggested form values."""
    api_key = get_api_key()
    if not api_key:
        raise AssistError("ANTHROPIC_API_KEY is not set on the Spoolman server.")

    model = get_model()
    candidates = find_spoolmandb_candidates(req.query + " " + str(req.current.get("vendor") or ""))
    messages: list[dict[str, Any]] = [{"role": "user", "content": _build_user_message(req, candidates)}]

    params: dict[str, Any] = {
        "model": model,
        "max_tokens": 16000,
        "system": FILAMENT_SYSTEM,
        "output_config": {
            "effort": get_effort(),
            "format": {"type": "json_schema", "schema": FILAMENT_SCHEMA},
        },
        "tools": [
            {"type": "web_search_20260209", "name": "web_search", "max_uses": get_max_searches()},
            {"type": "web_fetch_20260209", "name": "web_fetch", "max_uses": 2, "max_content_tokens": 20000},
        ],
    }
    if model in FALLBACK_MODELS:
        params["betas"] = ["server-side-fallback-2026-07-01"]
        params["fallbacks"] = "default"

    client = anthropic.AsyncAnthropic(api_key=api_key, timeout=120.0)
    input_tokens = output_tokens = web_searches = 0
    try:
        # Server tools can pause a long turn; re-send to let it continue.
        for _ in range(4):
            response = await client.beta.messages.create(messages=messages, **params)
            input_tokens += response.usage.input_tokens
            output_tokens += response.usage.output_tokens
            if response.usage.server_tool_use:
                web_searches += response.usage.server_tool_use.web_search_requests or 0
            if response.stop_reason != "pause_turn":
                break
            messages = [messages[0], {"role": "assistant", "content": response.content}]
    except anthropic.AuthenticationError as e:
        raise AssistError("The Anthropic API key was rejected.") from e
    except anthropic.RateLimitError as e:
        raise AssistError("Rate limited by the Anthropic API, try again in a minute.") from e
    except anthropic.APIStatusError as e:
        logger.exception("Assist request failed.")
        raise AssistError(f"Anthropic API error ({e.status_code}): {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise AssistError("Could not reach the Anthropic API.") from e

    data = _parse_result(response)

    logger.info(
        "Assist filament lookup: model=%s in=%d out=%d searches=%d",
        response.model,
        input_tokens,
        output_tokens,
        web_searches,
    )
    return FilamentAssistResponse(
        fields=data["fields"],
        notes=data["notes"],
        sources=data["sources"],
        model=response.model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        web_searches=web_searches,
    )
