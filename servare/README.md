# Bodega Aquí Jaime — Servare

Sistema de control de bodega (Fase 1). HTML + JS + Tailwind por CDN, backend en Google Apps Script + Google Sheets.

**Independiente de Cerebrus.** Cerebrus sigue con facturas, SAC, etc.; este sistema maneja inventario, movimientos y stock.

## Archivos

```
servare/
├── index.html              Login PIN
├── app.html                Dashboard + movimiento rápido
├── apps-script/Codigo.gs   Copiar al editor de Apps Script
├── js/                     Módulos ES6
├── css/styles.css
├── manifest.json           PWA
├── archive/                Respaldo inventario legacy (solo consulta)
└── README.md
```

## Instalación (una vez)

### 1. Crear planilla

1. [Google Sheets](https://sheets.google.com) → hoja en blanco
2. Nombre: `BODEGA_AQUI_JAIME`

### 2. Apps Script

1. **Extensiones → Apps Script**
2. Borrar `Code.gs` y pegar todo `apps-script/Codigo.gs`
3. Ejecutar función **`setup`** → autorizar permisos
4. En **Ejecuciones** debe decir Completada
5. En la hoja **Config**, copiar el valor de `token_api` (se genera en setup)

### 3. Publicar Web App

1. **Implementar → Nueva implementación → Aplicación web**
2. Ejecutar como: **Yo**
3. Acceso: **Cualquier persona**
4. Copiar URL que termina en `/exec`

Probar: `TU_URL/exec?action=ping` → `{"ok":true,"service":"bodega-aqui-jaime",...}`

### 4. Configurar la app

1. Abrir `servare/index.html` (local o GitHub Pages en `/servare/`)
2. En **Configurar conexión**: pegar URL `/exec` y `token_api`
3. Login con PIN de prueba: **1234** (Admin) o **5678** (Bodega)

Cambia los PIN en la hoja **Usuarios** antes de producción.

### 5. Productos

Agrega filas en la hoja **Productos**:

| sku | nombre | categoria | unidad | tipo | costo_promedio | stock_min | requiere_lote | activo |
|-----|--------|-----------|--------|------|----------------|-----------|---------------|--------|
| ARR-001 | Arroz grano largo | Abarrotes | KG | INSUMO | 1200 | 10 | NO | SI |

El stock se calcula solo desde **Movimientos** (hoja Stock con fórmulas).

## GitHub Pages (mismo repo que Cerebrus)

**No hace falta otro repositorio.** El workflow `.github/workflows/deploy-pages.yml` sube **todo el repo** a Pages. Con cada `git push` a `main`, Servare se publica automáticamente junto a Cerebrus.

| App | URL |
|-----|-----|
| Cerebrus | `https://diegoaquijaime.github.io/cerebrus/` |
| Bodega (Servare) | `https://diegoaquijaime.github.io/cerebrus/servare/` |

En Cerebrus hay un enlace **Abrir bodega →** en la pestaña Inventario.

**Importante:** la URL del Apps Script y el `token_api` **no van en el código** (repo público). Cada dispositivo los guarda en localStorage la primera vez.

## Inventario anterior

El inventario del sistema Cerebrus/Servare viejo está respaldado en `archive/` (418 productos). No se migra automáticamente al nuevo modelo. Pide la lista cuando la necesites.

## Fases siguientes

- **Fase 2:** Órdenes de compra, recepción, facturas
- **Fase 3:** Preelaboración y recetas
- **Fase 4:** Inventario físico, lotes, reportes

Ver especificación completa en el documento `bodega-aqui-jaime-version-simpleFinal.md`.
