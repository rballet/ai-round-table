from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from llm.types import Message


def log_prompt(
    *,
    session_id: str,
    phase: str,
    agent_name: str,
    agent_role: str,
    round_index: int | None,
    provider: str,
    model: str,
    messages: list[Message],
    response: str,
    log_dir: str,
) -> None:
    """Append a prompt+response entry to the per-session log file.

    Each session gets its own file: {log_dir}/{session_id}.log
    Entries are separated by a clear header so they are easy to scan in an IDE.
    Does nothing when log_dir is empty.
    """
    if not log_dir:
        return

    try:
        path = Path(log_dir)
        path.mkdir(parents=True, exist_ok=True)
        log_file = path / f"{session_id}.log"

        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        round_label = f"Round {round_index}" if round_index is not None else "-"

        parts: list[str] = [
            "\n" + "=" * 80,
            f"[{now}]  {phase.upper()}  |  {agent_name} ({agent_role})"
            f"  |  {round_label}  |  {provider}/{model}",
            "=" * 80,
        ]

        for msg in messages:
            role = msg.get("role", "?")
            content = msg.get("content", "")
            parts.append(f"\n--- {role.upper()} ---")
            parts.append(content)

        parts.append("\n--- RESPONSE ---")
        parts.append(response)
        parts.append("")

        with open(log_file, "a", encoding="utf-8") as f:
            f.write("\n".join(parts) + "\n")

    except Exception:  # noqa: BLE001 — never crash the caller over logging
        pass
