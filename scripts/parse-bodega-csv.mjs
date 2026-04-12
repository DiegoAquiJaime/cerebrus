#!/usr/bin/env node
/**
 * Lista maestra inventario Bodega N°3 desde plantilla CSV (orden = orden del archivo).
 * Codificación: ISO-8859-1 (latin1).
 *
 * CSV por defecto (en el repo): data/inventario-bodega-n3-plantilla.csv
 *
 * Uso: node scripts/parse-bodega-csv.mjs [ruta.csv]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Lista maestra Bodega N°3 (copia en el proyecto). */
const CSV_PLANTILLA_BODEGA3_DEFAULT = path.join(
  __dirname,
  '..',
  'data',
  'inventario-bodega-n3-plantilla.csv'
);

const csvPath = process.argv[2] || CSV_PLANTILLA_BODEGA3_DEFAULT;

/** Subtítulos dentro del bloque PRODUCCION (solo nombre, sin unidad) → nueva categoría */
const PRODUCCION_SUBSECTIONS = new Set([
  'PRODUCCION',
  'FETUCCINNI',
  'CALDOSO',
  'CEBICHE',
  'CAMARON PARA PORCIONAR',
  'PRODUCCION EMPANADAS',
  'MACHAS PARMESANAS',
  'OSTIONES PARMESANOS',
  'CARNE DE JAIBA PRODUCCION',
]);

const UNIT_MAP = {
  KG: 'kg',
  G: 'g',
  BOLSAS: 'bolsa',
  BANDEJA: 'bandeja',
  PORCION: 'porción',
  UNIDAD: 'unidad',
  CJ: 'caja',
  cj: 'caja',
  LT: 'L',
  DISPLAY: 'unidad',
  PACK: 'caja',
  DOCENA: 'docena',
  UN: 'unidad',
};

function normUnit(u) {
  if (!u) return 'unidad';
  const k = u.trim();
  const up = k.toUpperCase();
  return UNIT_MAP[k] || UNIT_MAP[up] || k.trim().toLowerCase();
}

function parseMin(s) {
  if (!s || !String(s).trim()) return 0;
  const t = String(s).trim().replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

const raw = fs.readFileSync(csvPath, 'latin1');
const lines = raw.split(/\r?\n/);

let currentCat = 'General';
let inProduccionBlock = false;
const items = [];
let order = 0;

for (let li = 0; li < lines.length; li++) {
  const line = lines[li];
  if (!line.trim()) continue;
  const parts = line.split(';').map((x) => x.trim());
  if (parts[1] === 'PRODUCTOS' || parts[0] === 'INVENTARIO BODEGA') continue;
  if (!parts[1]) continue;

  const col1 = parts[1];
  const col2 = parts[2] || '';
  const col3 = parts[3] || '';

  if (col1 === 'INVENTARIO BODEGA') continue;

  if (!col2) {
    if (col1 === 'PRODUCCION') inProduccionBlock = true;

    if (inProduccionBlock) {
      if (PRODUCCION_SUBSECTIONS.has(col1)) {
        currentCat = col1;
        continue;
      }
      items.push({
        id: 'inv_bdn3_' + order,
        nombre: col1,
        cat: currentCat,
        familia: currentCat,
        subfamilia: 'Sin subfamilia',
        unidad: 'unidad',
        stock: 0,
        minimo: 0,
        qty: 0,
        prov: '',
        precios: [],
        invOrden: order,
        invPlantilla: 'bodega_n3_2026',
      });
      order++;
      continue;
    }

    currentCat = col1;
    continue;
  }

  items.push({
    id: 'inv_bdn3_' + order,
    nombre: col1,
    cat: currentCat,
    familia: currentCat,
    subfamilia: 'Sin subfamilia',
    unidad: normUnit(col2),
    stock: 0,
    minimo: parseMin(col3),
    qty: 0,
    prov: '',
    precios: [],
    invOrden: order,
    invPlantilla: 'bodega_n3_2026',
  });
  order++;
}

const outPathJs = path.join(__dirname, '..', 'inv-bodega-n3-data.js');
const payload = JSON.stringify(items);
fs.writeFileSync(
  outPathJs,
  "'use strict';\n" +
    '/** Inventario Bodega N°3 — generado por scripts/parse-bodega-csv.mjs */\n' +
    'window.INV_BODEGA_N3_ITEMS = ' +
    payload +
    ';\n',
  'utf8'
);

const outPathJson = path.join(__dirname, 'inv-bodega-n3-generated.json');
fs.writeFileSync(
  outPathJson,
  JSON.stringify({ generated: new Date().toISOString(), source: csvPath, count: items.length, items }, null, 2),
  'utf8'
);

console.log('OK', items.length, 'productos');
console.log(' →', outPathJs);
console.log(' →', outPathJson);
