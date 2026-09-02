# Datos iniciales — Bodega Aquí Jaime

## Productos migrados (418)

| Archivo | Uso |
|---------|-----|
| `productos-migrados.csv` | Importar a Google Sheet → pestaña Productos |
| `productos-migrados.json` | Mismo contenido en JSON |
| `productos-proveedor-legacy.csv` | SKU + proveedor viejo (para cuando cargues proveedores mañana) |

- `costo_promedio` = **0** en todos (como pediste).
- `stock_min` viene del mínimo del inventario anterior.
- `requiere_lote` = SI en pescados, mariscos y carnes (aprox.).

## Cómo cargar en Google (elige una)

### Opción A — Directo a Productos (más rápida)

1. Abre `BODEGA_AQUI_JAIME` en Google Sheets.
2. Pestaña **Productos** (debe existir tras `setup`).
3. **Archivo → Importar → Subir** → `productos-migrados.csv`.
4. Ubicación: **Reemplazar datos en: Productos** (o pegar desde A1 si está vacía).
5. Separador: coma. Listo — recarga la app.

### Opción B — Con función Apps Script

1. **Archivo → Importar** el CSV como **nueva hoja**.
2. Renómbrala **`ProductosImport`**.
3. Apps Script → ejecutar **`migrarProductosImport`**.
4. Revisa pestaña **Productos** (418 filas).

Después de importar, en la app deberías ver **418 productos activos**.
