#!/usr/bin/env bash
# Sube servare/apps-script/Codigo.gs → Google Apps Script y actualiza el deploy web.
#
# Una sola vez:
#   1. cd servare && npx @google/clasp login
#   2. Copia .clasp.json.example → .clasp.json y pega el scriptId
#      (Apps Script → URL: .../projects/ESTE_ID/edit)
#
# Luego, cada cambio:
#   ./servare/scripts/deploy-apps-script.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .clasp.json ]]; then
  echo "Falta servare/.clasp.json — copia .clasp.json.example y pega tu scriptId."
  exit 1
fi

DEPLOY_ID="AKfycbx8An-Ubc3PC2v6iSHZgxHNBdsnmvg5YqUy4BZy2YoizegekJjY8huC30iWfih467w-Xw"

echo "→ Subiendo código (clasp push)…"
npx --yes @google/clasp push -f

echo "→ Nueva versión del Web App (misma URL /exec)…"
npx --yes @google/clasp deploy -i "$DEPLOY_ID" -d "bodega-aqui-jaime"

echo "✓ Apps Script actualizado (misma URL /exec)."
