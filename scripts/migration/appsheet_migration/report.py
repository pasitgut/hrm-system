from __future__ import annotations

from collections import Counter


class Report:
    """Collects what the operator should review: warnings plus counters of skipped/created rows."""

    def __init__(self) -> None:
        self.warnings: list[str] = []
        self.counts: Counter[str] = Counter()

    def warn(self, message: str) -> None:
        self.warnings.append(message)
