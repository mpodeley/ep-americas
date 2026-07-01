"""Shared JSON helpers. Envelope matches pozos-neuquina / estado_del_sistema:
{ generated_at, source, source_date, data }."""
import json
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def envelope(data, source: str, source_date=None) -> dict:
    return {
        "generated_at": utc_now_iso(),
        "source": source,
        "source_date": source_date,
        "data": data,
    }


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")


def read_json(path: Path, default=None):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default
