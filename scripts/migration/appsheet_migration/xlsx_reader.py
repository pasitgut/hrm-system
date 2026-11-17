"""Minimal .xlsx reader on the standard library (no openpyxl needed)."""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

Cells = dict[int, object]            # 0-based column index -> value (blank cells are omitted)
SheetRows = list[tuple[int, Cells]]  # (Excel row number, cells); the first entry is the header row

_NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def _column_index(cell_ref: str) -> int:
    index = 0
    for ch in re.match(r"[A-Z]+", cell_ref).group():
        index = index * 26 + ord(ch) - 64
    return index - 1


def _read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return ["".join(t.text or "" for t in si.iter("{%s}t" % _NS["m"])) for si in root.findall("m:si", _NS)]


def _read_cell(cell: ET.Element, shared: list[str]) -> object | None:
    cell_type = cell.get("t")
    value = cell.find("m:v", _NS)
    if cell_type == "inlineStr":
        return "".join(x.text or "" for x in cell.iter("{%s}t" % _NS["m"]))
    if value is None or value.text is None:
        return None
    if cell_type == "s":
        return shared[int(value.text)]
    if cell_type in ("str", "e"):
        return value.text
    if cell_type == "b":
        return value.text == "1"
    return float(value.text)


def _read_sheet(archive: zipfile.ZipFile, part: str, shared: list[str]) -> SheetRows:
    rows: SheetRows = []
    for row in ET.fromstring(archive.read(part)).find("m:sheetData", _NS):
        cells: Cells = {}
        for cell in row:
            value = _read_cell(cell, shared)
            if value is not None and value != "":
                cells[_column_index(cell.get("r"))] = value
        if cells:
            rows.append((int(row.get("r")), cells))
    return rows


def read_sheets(path: Path, wanted: list[str]) -> dict[str, SheetRows]:
    """Rows of the `wanted` sheets; raises SystemExit when one is missing from the workbook."""
    with zipfile.ZipFile(path) as archive:
        shared = _read_shared_strings(archive)
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        targets = {r.get("Id"): r.get("Target") for r in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
        sheet_parts = {
            s.get("name"): targets[s.get("{%s}id" % _NS["r"])].lstrip("/")
            for s in workbook.find("m:sheets", _NS)
        }
        missing = [name for name in wanted if name not in sheet_parts]
        if missing:
            raise SystemExit(f"Sheet(s) not found in workbook: {missing}. Found: {list(sheet_parts)}")
        return {
            name: _read_sheet(archive, part if part.startswith("xl/") else "xl/" + part, shared)
            for name, part in sheet_parts.items() if name in wanted
        }
