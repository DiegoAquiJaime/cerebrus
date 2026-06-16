# Cerebrus — Paso 1: Supabase (prueba, sin reemplazar Google Sheets)

Objetivo: tener **base de datos en la nube con backups**, probando **una partición** desde Mantenimiento. **Cerebrus sigue guardando en Sheets** como siempre.

## 1. Crear cuenta y proyecto (15 min)

1. Entrá a [https://supabase.com](https://supabase.com) y creá cuenta (GitHub o email).
2. **New project**
   - Name: `cerebrus` (o el que quieras)
   - Database password: guardala en un lugar seguro (1Password, notas)
   - Region: **South America (São Paulo)** — la más cercana a Chile
3. Plan **Free** alcanza para esta prueba. Cuando quieras backups diarios automáticos: **Pro ~USD 25/mes**.

## 2. Crear tablas (5 min)

1. En el proyecto: **SQL Editor** → **New query**
2. Copiá y ejecutá todo el archivo [`supabase/schema.sql`](../supabase/schema.sql)
3. Deberías ver: `cerebrus_meta`, `cerebrus_parts`, `cerebrus_snapshots`

## 3. Obtener URL y anon key (2 min)

1. **Project Settings** (engranaje) → **API**
2. Copiá:
   - **Project URL** → ej. `https://abcdefgh.supabase.co`
   - **anon public** key (empieza con `eyJ...`)

⚠️ La `anon key` es pública en el navegador (como la URL de Apps Script). La seguridad la dan las políticas RLS del SQL. Para equipo interno está bien en Paso 1.

## 4. Probar desde Cerebrus (sin tocar producción)

1. Abrí Cerebrus → **⚙ Configuración** → **🗄 Mantenimiento**
2. Bajá a **Paso 1 — Prueba Supabase**
3. Pegá URL y anon key → **Guardar en este navegador**
4. **Probar conexión** → debe decir ✓ Conexión OK
5. Elegí partición **pMisc** (la más chica) → **Subir partición de prueba**
6. **Leer desde Supabase** y **Comparar con local** — los KB deben coincidir

**Google Sheets no se modifica** en este paso.

## 5. Verificar en Supabase (opcional)

**Table Editor** → `cerebrus_parts` → deberías ver una fila `pMisc` con `payload_bytes`.

## Qué sigue (Paso 2, cuando ustedes quieran)

- Subir las 5 particiones como respaldo completo
- Leer desde Supabase en paralelo a Sheets
- Cambiar `saveToCloud` para escribir en Supabase
- Apagar Sheets cuando confíen

## Costos orientativos

| Plan | Precio | Para qué |
|------|--------|----------|
| Free | $0 | Prueba, poco tráfico |
| Pro | ~$25/mes | Backups diarios, más espacio, soporte |

## Archivos en este repo

| Archivo | Uso |
|---------|-----|
| `supabase/schema.sql` | SQL para crear tablas |
| `supabase/config.example.json` | Plantilla (sin secretos) |
| `supabase/config.local.json` | Tus credenciales locales (**no se sube a Git**) |

## Problemas frecuentes

| Error | Solución |
|-------|----------|
| `401` / JWT | Revisá que copiaste la **anon** key, no la `service_role` |
| `relation does not exist` | Ejecutá de nuevo `schema.sql` |
| `RLS` / permission denied | Volvé a ejecutar las políticas del final de `schema.sql` |
| CORS | Supabase REST permite browser; si falla, revisá URL sin `/` final |
