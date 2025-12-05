#!/usr/bin/env python3
"""Build js/tariffs.js from schema_tariffario.xlsx."""

from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Dict, List, Tuple


BASE_DIR = Path(__file__).resolve().parents[1]
XLSX_PATH = BASE_DIR / "schema_tariffario.xlsx"
OUTPUT_PATH = BASE_DIR / "js" / "tariffs.js"

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
MAPPING: List[Tuple[str, str, str, str, str]] = [
    ("C", "D", "ordinario", "Biglietto ordinario", "biglietti"),
    ("E", "F", "giornaliero", "Giornaliero", "biglietti"),
    ("G", "H", "settimanale", "Settimanale", "biglietti"),
    ("I", "J", "mensile", "Mensile", "abbonamenti"),
    ("K", "L", "annuale", "Annuale ordinario", "abbonamenti"),
    ("M", "N", "annuale_agevolato", "Annuale agevolato", "abbonamenti"),
    ("O", "P", "annuale_over65", "Annuale over 65", "abbonamenti"),
    ("Q", "R", "annuale_studenti", "Annuale studenti", "abbonamenti"),
    ("S", "T", "annuale_studenti_agevolato", "Annuale studenti agevolato", "abbonamenti"),
]


def main() -> int:
    if not XLSX_PATH.exists():
        sys.stderr.write(f"Impossibile trovare {XLSX_PATH}\n")
        return 1

    dataset = build_dataset()
    payload = "// Auto-generated from schema_tariffario.xlsx\n" + "export const TARIFFS = " + json.dumps(
        dataset, indent=2, ensure_ascii=False
    ) + ";\n"

    OUTPUT_PATH.write_text(payload)
    print(f"Aggiornato {OUTPUT_PATH.relative_to(BASE_DIR)} ({len(dataset)} voci)")
    return 0


def build_dataset() -> Dict[str, dict]:
    rows = extract_rows()
    result: Dict[str, dict] = {}
    current_fascia = ""

    for row in rows:
        fascia_raw = (row.get("A") or "").strip()
        tipo = (row.get("B") or "").strip()

        if fascia_raw and fascia_raw.upper() in {"FASCIA", "SCHEMA TARIFFARIO"}:
            continue

        if fascia_raw:
            current_fascia = fascia_raw
        elif not current_fascia:
            continue

        label = " ".join(current_fascia.split())
        base_key = re.sub(r"[^A-Za-z0-9]", "", label).upper()
        key = base_key + (tipo.upper() if tipo else "")
        if not key:
            continue

        entry = result.setdefault(
            key,
            {
                "label": label,
                "tipo": tipo or None,
                "tickets": {},
                "abbonamenti": {},
            },
        )

        for col_a, col_b, name, human, group in MAPPING:
            azi, integ = parse_number(row.get(col_a)), parse_number(row.get(col_b))
            if azi is None and integ is None:
                continue

            target = entry["tickets" if group == "biglietti" else "abbonamenti"]
            target[name] = {
                "label": human,
                "aziendale": azi,
                "integrato": integ,
            }

    return result


def extract_rows() -> List[Dict[str, str]]:
    import zipfile

    with zipfile.ZipFile(XLSX_PATH) as archive:
        shared_strings = _load_shared_strings(archive)
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        rows: List[Dict[str, str]] = []
        for row in sheet.find(f"{NS}sheetData").findall(f"{NS}row"):
            data: Dict[str, str] = {}
            for cell in row.findall(f"{NS}c"):
                ref = cell.get("r", "")
                col = "".join(ch for ch in ref if ch.isalpha())
                data[col] = _cell_value(cell, shared_strings)
            rows.append(data)
        return rows


def _load_shared_strings(archive) -> List[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []

    strings: List[str] = []
    for node in root.findall(f"{NS}si"):
        text = "".join(part.text or "" for part in node.iter() if part.text)
        strings.append(text)
    return strings


def _cell_value(cell, shared_strings: List[str]) -> str:
    value_node = cell.find(f"{NS}v")
    if value_node is None:
        return ""
    raw = value_node.text or ""
    return shared_strings[int(raw)] if cell.get("t") == "s" else raw


def parse_number(value: str | None) -> float | None:
    if not value or value.strip() in {"", "-"}:
        return None
    try:
        return float(Decimal(value))
    except InvalidOperation:
        return None


if __name__ == "__main__":
    raise SystemExit(main())
