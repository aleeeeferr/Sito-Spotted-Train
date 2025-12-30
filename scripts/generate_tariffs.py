#!/usr/bin/env python3
"""Build js/tariffs.js from schema_tariffario.xlsx."""

import json
import sys
import xml.etree.ElementTree as ET
from decimal import Decimal, InvalidOperation
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]
XLSX_PATH = BASE_DIR / "tariffario" / "schema_tariffario.xlsx"
OUTPUT_PATH = BASE_DIR / "frontend" / "js" / "tariffs.js"

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
MAPPING = [
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
    payload = (
        "// Auto-generated from schema_tariffario.xlsx\n"
        "export const TARIFFS = "
        + json.dumps(dataset, indent=2, ensure_ascii=False)
        + ";\n"
    )

    OUTPUT_PATH.write_text(payload)
    print(f"Aggiornato {OUTPUT_PATH.relative_to(BASE_DIR)} ({len(dataset)} voci)")
    return 0


def build_dataset():
    import zipfile

    with zipfile.ZipFile(XLSX_PATH) as archive:
        # Carica le stringhe condivise (se non esistono, lista vuota).
        try:
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared_strings = [
                "".join(part.text or "" for part in node.iter() if part.text)
                for node in root.findall(f"{NS}si")
            ]
        except KeyError:
            shared_strings = []

        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))

    result = {}
    current_fascia = ""

    for row in sheet.find(f"{NS}sheetData").findall(f"{NS}row"):
        # Legge tutte le celle della riga.
        data = {}
        for cell in row.findall(f"{NS}c"):
            ref = cell.get("r", "")
            col = "".join(ch for ch in ref if ch.isalpha())
            value_node = cell.find(f"{NS}v")
            if value_node is None:
                value = ""
            else:
                raw = value_node.text or ""
                value = shared_strings[int(raw)] if cell.get("t") == "s" else raw
            data[col] = value

        fascia_raw = (data.get("A") or "").strip()
        tipo = (data.get("B") or "").strip()

        if fascia_raw and fascia_raw.upper() in {"FASCIA", "SCHEMA TARIFFARIO"}:
            continue
        if fascia_raw:
            current_fascia = fascia_raw
        elif not current_fascia:
            continue

        label = " ".join(current_fascia.split())
        base_key = "".join(ch for ch in label if ch.isalnum()).upper()
        key = base_key + (tipo.upper() if tipo else "")
        if not key:
            continue

        if key not in result:
            result[key] = {
                "label": label,
                "tipo": tipo or None,
                "tickets": {},
                "abbonamenti": {},
            }

        entry = result[key]

        for col_a, col_b, name, human, group in MAPPING:
            azi = parse_number(data.get(col_a))
            integ = parse_number(data.get(col_b))
            if azi is None and integ is None:
                continue
            target = entry["tickets"] if group == "biglietti" else entry["abbonamenti"]
            target[name] = {"label": human, "aziendale": azi, "integrato": integ}

    return result


def parse_number(value):
    if not value or value.strip() in {"", "-"}:
        return None
    try:
        return float(Decimal(value))
    except InvalidOperation:
        return None


if __name__ == "__main__":
    raise SystemExit(main())
