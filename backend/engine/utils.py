from __future__ import annotations


def strip_code_fences(text: str) -> str:
    """Remove markdown code fences that LLMs sometimes add despite instructions."""
    text = text.strip()
    if text.startswith("```"):
        # Drop the opening fence line (e.g. "```json\n" or "```\n")
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text[: text.rfind("```")].rstrip()
    return text.strip()
