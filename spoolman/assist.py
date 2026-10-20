"""AI assist: look things up on the web with Claude and return form field suggestions."""

import json
import logging
import os
import re
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import anthropic
from anthropic.types.beta import BetaMessage
from pydantic import BaseModel, Field

from spoolman.externaldb import get_filaments_file, get_materials_file

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-opus-5-5"
DEFAULT_EFFORT = "low"
DEFAULT_MAX_SEARCHES = 3
MIN_CANDIDATE_OVERLAP = 2
MAX_CANDIDATES = 5

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


NUMBER = _nullable({"type": "number"})
INTEGER = _nullable({"type": "integer"})
STRING = _nullable({"type": "string"})


COMMON_RULES = """\
You help fill in forms in Spoolman, a 3D printing filament inventory. Given a short description and the \
current form values, find accurate information and return it as structured field values. A human reviews \
every value before saving.

General rules:
- Prefer manufacturers' own product pages and technical data sheets; retailer listings are the next best.
- Entries from SpoolmanDB (a curated community database) are provided when they look relevant; trust them \
when they clearly match, and only search the web for what they don't cover.
- Return null for anything you cannot find or reasonably determine. Never invent prices.
- Leave a field null when the current form value is already correct; only suggest values that add or fix \
something.
- notes: one or two short sentences on what you found and anything uncertain. sources: the pages you used \
(empty if you relied only on SpoolmanDB or general knowledge).
"""

FILAMENT_RULES = """\
Task: a filament product (vendor, product line, color).
- Generic material defaults are acceptable for density and diameter (e.g. PLA 1.24, PETG 1.27, ABS 1.04, \
ASA 1.07, TPU 1.21; 1.75 mm) when the product doesn't state them.
- Temperatures: use a single recommended value in °C; if a range is given, pick the midpoint rounded to 5.
- weight is the net filament weight of a full spool in grams; spool_weight is the empty spool in grams.
- price is the typical current price of one spool in the user's currency; null if unclear.
- color_hex is a 6-digit hex without "#" for single-color filaments. For multi-color filaments (dual/tri \
color, coextruded, gradient) set color_hexes instead, leave color_hex null, and set multi_color_direction \
("coaxial" for dual/tri-color coextruded, "longitudinal" for gradient/rainbow along the length).
- material must be one of the user's existing material types when one fits; otherwise the plain material name.
- vendor should be the manufacturer's brand name; match the spelling of an existing vendor when it's the same brand.
- name follows the user's convention: "<Vendor> <Material> <Color>", e.g. "Sunlu PLA+ White", \
"Reprapper PLA Silk Gold", "TinMorry PETG Metallic Blue".
"""

VENDOR_RULES = """\
Task: a filament manufacturer/brand.
- name: the brand's usual spelling and capitalization as the manufacturer writes it (e.g. "eSUN", "SUNLU", \
"Polymaker"); null if the current name is already right.
- empty_spool_weight: weight in grams of the brand's standard empty 1 kg spool. If the brand uses several \
spool types, pick the most common one and mention the others in notes.
"""

FILAMENT_TYPE_RULES = """\
Task: a filament material type (e.g. PLA, PETG, PLA Silk, ASA, PA-CF).
- name: the material's common name, keeping the user's style; null if already right.
- density in g/cm3; settings_extruder_temp and settings_bed_temp: typical recommended single values in °C \
(midpoint of common ranges, rounded to 5).
- comment: one short line of practical printing notes (e.g. enclosure needed, drying temp/time, \
hardened nozzle), or null.
"""

SPOOL_TYPE_RULES = """\
Task: a type of empty spool made by a vendor (used to know the tare weight).
- weight: weight in grams of the empty spool.
- category: the spool material/kind; must be one of the user's existing categories when one fits \
(list provided), otherwise a short name like "Plastic", "Cardboard" or "Refill/Masterspool".
- color: the spool's own color, e.g. "Black", "Clear", "White", "Cardboard brown".
"""

SPOOL_RULES = """\
Task: a physical spool of a given filament (filament details provided).
- price: the typical current price of one spool of this exact product in the user's currency; null if unclear.
- initial_weight: net filament weight of a full spool in grams.
- spool_weight: the empty spool weight in grams.
"""


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9+]+", text.lower()))


def _load_json(path_getter: Callable[[], Any]) -> list[dict[str, Any]]:
    try:
        return json.loads(path_getter().read_text())
    except Exception:
        logger.exception("Failed to read SpoolmanDB file.")
        return []


def _best_matches(
    query: str, items: list[dict[str, Any]], text: Callable[[dict[str, Any]], str], min_overlap: int
) -> list[dict[str, Any]]:
    query_tokens = _tokens(query)
    scored = []
    for item in items:
        overlap = len(query_tokens & _tokens(text(item)))
        if overlap >= min_overlap:
            scored.append((overlap, item))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [item for _, item in scored[:MAX_CANDIDATES]]


def filament_candidates(query: str) -> list[dict[str, Any]]:
    """SpoolmanDB filaments that share the most words with the query."""
    return _best_matches(
        query,
        _load_json(get_filaments_file),
        lambda f: f"{f.get('manufacturer', '')} {f.get('name', '')} {f.get('material', '')}",
        MIN_CANDIDATE_OVERLAP,
    )


def vendor_candidates(query: str) -> list[dict[str, Any]]:
    """Per-manufacturer summary of spool weights/types in SpoolmanDB, for manufacturers named in the query."""
    query_tokens = _tokens(query)
    summary: dict[str, dict[str, Counter]] = {}
    for f in _load_json(get_filaments_file):
        manufacturer = f.get("manufacturer", "")
        if not manufacturer or not _tokens(manufacturer) <= query_tokens:
            continue
        entry = summary.setdefault(manufacturer, {"spool_weights": Counter(), "spool_types": Counter()})
        if f.get("spool_weight"):
            entry["spool_weights"][f["spool_weight"]] += 1
        if f.get("spool_type"):
            entry["spool_types"][f["spool_type"]] += 1
    return [
        {
            "manufacturer": name,
            "empty_spool_weights_g (value: count)": dict(entry["spool_weights"].most_common(5)),
            "spool_types (value: count)": dict(entry["spool_types"].most_common()),
        }
        for name, entry in list(summary.items())[:MAX_CANDIDATES]
    ]


def material_candidates(query: str) -> list[dict[str, Any]]:
    """SpoolmanDB materials that share a word with the query."""
    return _best_matches(query, _load_json(get_materials_file), lambda m: m.get("material", ""), 1)


@dataclass
class AssistTask:
    rules: str
    fields: dict[str, dict[str, Any]]
    candidates: Callable[[str], list[dict[str, Any]]] | None = None

    def schema(self) -> dict[str, Any]:
        """JSON schema for the structured output."""
        return {
            "type": "object",
            "properties": {
                "fields": {
                    "type": "object",
                    "properties": self.fields,
                    "required": list(self.fields),
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


TASKS: dict[str, AssistTask] = {
    "filament": AssistTask(
        rules=FILAMENT_RULES,
        fields={
            "vendor": STRING,
            "name": STRING,
            "material": STRING,
            "density": NUMBER,
            "diameter": NUMBER,
            "weight": NUMBER,
            "spool_weight": NUMBER,
            "price": NUMBER,
            "settings_extruder_temp": INTEGER,
            "settings_bed_temp": INTEGER,
            "color_hex": STRING,
            "color_hexes": _nullable({"type": "array", "items": {"type": "string"}}),
            "multi_color_direction": _nullable({"type": "string", "enum": ["coaxial", "longitudinal"]}),
        },
        candidates=filament_candidates,
    ),
    "vendor": AssistTask(
        rules=VENDOR_RULES,
        fields={"name": STRING, "empty_spool_weight": NUMBER},
        candidates=vendor_candidates,
    ),
    "filament_type": AssistTask(
        rules=FILAMENT_TYPE_RULES,
        fields={
            "name": STRING,
            "density": NUMBER,
            "settings_extruder_temp": INTEGER,
            "settings_bed_temp": INTEGER,
            "comment": STRING,
        },
        candidates=material_candidates,
    ),
    "spool_type": AssistTask(
        rules=SPOOL_TYPE_RULES,
        fields={"weight": NUMBER, "category": STRING, "color": STRING},
        candidates=vendor_candidates,
    ),
    "spool": AssistTask(
        rules=SPOOL_RULES,
        fields={"price": NUMBER, "initial_weight": NUMBER, "spool_weight": NUMBER},
        candidates=filament_candidates,
    ),
}


class AssistRequest(BaseModel):
    query: str = Field(description="Free-text description of what to look up, or a product URL.")
    current: dict[str, Any] = Field(default_factory=dict, description="Current form values.")
    context: dict[str, Any] = Field(
        default_factory=dict,
        description="Extra context, e.g. existing vendor/material names or the user's currency.",
    )


class AssistSource(BaseModel):
    title: str
    url: str


class AssistResponse(BaseModel):
    fields: dict[str, Any] = Field(description="Suggested field values; null means no suggestion.")
    notes: str
    sources: list[AssistSource]
    model: str
    input_tokens: int
    output_tokens: int
    web_searches: int


class AssistError(Exception):
    """Assist lookup failed in a way the user should see."""


def _build_user_message(req: AssistRequest, candidates: list[dict[str, Any]] | None) -> str:
    def fmt(value: Any) -> str:  # noqa: ANN401
        if isinstance(value, list):
            return ", ".join(str(v) for v in value) or "(none)"
        return value if isinstance(value, str) else json.dumps(value)

    current = {k: v for k, v in req.current.items() if v not in (None, "", [])}
    parts = [f"Look up: {req.query}", f"Current form values: {json.dumps(current)}"]
    parts += [f"{key.replace('_', ' ').capitalize()}: {fmt(value)}" for key, value in req.context.items()]
    if candidates is not None:
        parts.append(
            f"SpoolmanDB entries: {json.dumps(candidates)}" if candidates else "SpoolmanDB entries: none matched."
        )
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


async def _call_claude(
    api_key: str,
    params: dict[str, Any],
    messages: list[dict[str, Any]],
) -> tuple[BetaMessage, int, int, int]:
    """Call Claude, continuing paused server-tool turns. Returns the final response and total usage."""
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
    return response, input_tokens, output_tokens, web_searches


async def lookup(task_name: str, req: AssistRequest) -> AssistResponse:
    """Run an assist lookup and return suggested form values."""
    task = TASKS.get(task_name)
    if task is None:
        raise AssistError(f"Unknown assist task: {task_name}")
    api_key = get_api_key()
    if not api_key:
        raise AssistError("ANTHROPIC_API_KEY is not set on the Spoolman server.")

    model = get_model()
    candidates = None
    if task.candidates:
        candidate_query = " ".join([req.query, *(str(v) for v in req.current.values() if isinstance(v, str))])
        candidates = task.candidates(candidate_query)
    messages: list[dict[str, Any]] = [{"role": "user", "content": _build_user_message(req, candidates)}]

    params: dict[str, Any] = {
        "model": model,
        "max_tokens": 16000,
        "system": COMMON_RULES + "\n" + task.rules,
        "output_config": {
            "effort": get_effort(),
            "format": {"type": "json_schema", "schema": task.schema()},
        },
        "tools": [
            {"type": "web_search_20260209", "name": "web_search", "max_uses": get_max_searches()},
            {"type": "web_fetch_20260209", "name": "web_fetch", "max_uses": 2, "max_content_tokens": 20000},
        ],
    }
    if model in FALLBACK_MODELS:
        params["betas"] = ["server-side-fallback-2026-07-01"]
        params["fallbacks"] = "default"

    response, input_tokens, output_tokens, web_searches = await _call_claude(api_key, params, messages)
    data = _parse_result(response)

    logger.info(
        "Assist %s lookup: model=%s in=%d out=%d searches=%d",
        task_name,
        response.model,
        input_tokens,
        output_tokens,
        web_searches,
    )
    return AssistResponse(
        fields=data["fields"],
        notes=data["notes"],
        sources=data["sources"],
        model=response.model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        web_searches=web_searches,
    )
