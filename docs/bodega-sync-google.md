# Sync automático Bodega → Google Sheet

Mismo espíritu que Cerebrus: código en GitHub, un deploy en Google, push y listo.

## Configuración única (una vez)

### 1. Apps Script
1. Planilla `BODEGA_AQUI_JAIME` → **Extensiones → Apps Script**
2. Pegar `servare/apps-script/Codigo.gs` → Guardar
3. Ejecutar **`setup`** (si no lo hiciste) → autorizar
4. **Implementar → Nueva implementación → Aplicación web** → copiar URL `/exec`

### 2. URL en el repo
Editar `servare/deploy.config.json`:

```json
{
  "url": "https://script.google.com/macros/s/TU_ID/exec"
}
```

Commit + push.

### 3. Token en GitHub (secreto)
1. Sheet → pestaña **Config** → copiar `token_api`
2. GitHub repo → **Settings → Secrets and variables → Actions → New secret**
3. Nombre: **`BODEGA_API_TOKEN`** → pegar el token

### 4. Primera carga
**Actions → Sync Bodega productos → Run workflow**

Debe terminar en verde. La app mostrará 418 productos activos.

---

## A partir de ahí (automático)

Cualquier cambio en `servare/data/productos-migrados.json` + **push a main** → GitHub sube los productos al Sheet solo.

Cuando me pidas cambios en el chat: yo edito el JSON, hago push, y GitHub sincroniza.

Para sync desde tu Mac (opcional, mismo resultado):

```bash
# servare/.secrets.local.json solo con {"token":"..."} — url ya está en deploy.config.json
python3 servare/scripts/sync-productos.py
```
