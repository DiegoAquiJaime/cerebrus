#!/usr/bin/env python3
"""
Sincroniza servare/data/productos-migrados.json → Google Sheet vía Apps Script API.

Uso:
  export BODEGA_API_URL="https://script.google.com/macros/s/…/exec"
  export BODEGA_API_TOKEN="tu_token_api"
  python3 servare/scripts/sync-productos.py

O con archivo local (no subir a git):
  python3 servare/scripts/sync-productos.py --secrets servare/.secrets.local.json

Modos:
  --modo upsert       actualiza existentes y agrega nuevos (default)
  --modo solo_nuevos  solo agrega SKUs que no existen
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_JSON = ROOT / "servare/data/productos-migrados.json"
CHUNK = 80


def load_secrets(path: Path | None) -> tuple[str, str]:
    url = os.environ.get("BODEGA_API_URL", "").strip()
    token = os.environ.get("BODEGA_API_TOKEN", "").strip()
    if path and path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
        url = data.get("url") or url
        token = data.get("token") or token
    if not url or not token:
        raise SystemExit(
            "Faltan credenciales. Crea servare/.secrets.local.json con:\n"
            '  {"url":"https://script.google.com/macros/s/…/exec","token":"…"}\n'
            "O exporta BODEGA_API_URL y BODEGA_API_TOKEN."
        )
    return url.rstrip("/"), token


def api_post(url: str, token: str, payload: dict) -> dict:
    body = json.dumps({"token": token, **payload}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "text/plain;charset=utf-8"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.loads(res.read().decode("utf-8"))


def main() -> None:
    ap = argparse.ArgumentParser(description="Sync productos JSON → Bodega Sheet")
    ap.add_argument("--json", type=Path, default=DEFAULT_JSON)
    ap.add_argument("--secrets", type=Path, default=ROOT / "servare/.secrets.local.json")
    ap.add_argument("--modo", choices=["upsert", "solo_nuevos"], default="upsert")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.json.exists():
        raise SystemExit(f"No existe: {args.json}")

    data = json.loads(args.json.read_text(encoding="utf-8"))
    productos = data.get("productos") or data
    if not isinstance(productos, list):
        raise SystemExit("JSON inválido: se espera lista en productos")

    url, token = load_secrets(args.secrets if args.secrets.exists() else None)

    ping = urllib.request.urlopen(url + "?action=ping", timeout=30)
    ping_data = json.loads(ping.read().decode())
    if ping_data.get("service") != "bodega-aqui-jaime":
        print("AVISO: ping no devuelve bodega-aqui-jaime — ¿URL del script nuevo?", file=sys.stderr)

    print(f"Productos a enviar: {len(productos)} | modo: {args.modo}")
    if args.dry_run:
        print("Dry-run OK")
        return

    totals = {"added": 0, "updated": 0, "skipped": 0}
    for i in range(0, len(productos), CHUNK):
        chunk = productos[i : i + CHUNK]
        out = api_post(url, token, {
            "accion": "productos_bulk",
            "modo": args.modo,
            "usuario": "sync-github",
            "productos": chunk,
        })
        if not out.get("ok"):
            raise SystemExit(f"Error API: {out.get('error', out)}")
        totals["added"] += out.get("added", 0)
        totals["updated"] += out.get("updated", 0)
        totals["skipped"] += out.get("skipped", 0)
        print(f"  lote {i // CHUNK + 1}: +{out.get('added')} ~{out.get('updated')} omit {out.get('skipped')}")

    print(f"Listo: +{totals['added']} nuevos, ~{totals['updated']} actualizados, {totals['skipped']} omitidos")


if __name__ == "__main__":
    main()
