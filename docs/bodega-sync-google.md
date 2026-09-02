# Sincronizar datos con Google Sheet (para Cursor / GitHub)

## Por qué no se cargó solo

La app en GitHub Pages es solo **frontend**. El Sheet vive en **tu cuenta Google** y está protegido por el `token_api`. Sin esa URL + token, nadie (ni Cursor) puede escribir ahí.

## Solución recomendada (3 piezas)

```
GitHub (productos-migrados.json)
        │
        ▼
  script sync-productos.py  ──POST──►  Apps Script (productos_bulk)
        │                                      │
   token en secreto                            ▼
                                        Sheet Productos
```

### 1. Una vez: actualizar Apps Script

Pega el `Codigo.gs` **nuevo** (incluye `productos_bulk`) y **Implementar → Nueva versión** de la Web App.

### 2. Una vez: archivo de secretos (solo en tu Mac, NO en git)

Copia el ejemplo:

```bash
cp servare/.secrets.example.json servare/.secrets.local.json
```

Edita `servare/.secrets.local.json`:

```json
{
  "url": "https://script.google.com/macros/s/TU_ID/exec",
  "token": "el_token_api_de_Config"
}
```

Este archivo está en `.gitignore` — nunca sube a GitHub.

### 3. Cargar productos (tú o yo en Cursor)

```bash
python3 servare/scripts/sync-productos.py
```

Yo puedo ejecutar ese comando en el chat **si existe** `servare/.secrets.local.json` en tu Mac.

---

## Opción B — GitHub Actions (automático al hacer push)

1. Repo GitHub → **Settings → Secrets and variables → Actions**
2. Crear:
   - `BODEGA_API_URL` = URL `/exec`
   - `BODEGA_API_TOKEN` = `token_api`
3. Cada push a `servare/data/productos-migrados.json` sincroniza solo.
4. O manual: **Actions → Sync Bodega productos → Run workflow**

---

## Flujo futuro conmigo (Cursor)

1. Tú: “agrega estos 5 productos” o editamos `productos-migrados.json` en el repo.
2. Yo: actualizo el JSON y ejecuto `sync-productos.py` (con tus secretos locales).
3. O: commit + push → GitHub Action sincroniza si configuraste secrets.

Para **proveedores mañana**: mismo patrón con `proveedores_bulk` (se puede agregar igual).

---

## Seguridad

- El `token_api` es como una contraseña de la API — no va en el repo público.
- Quien tenga URL + token puede escribir catálogo; movimientos siguen pidiendo login PIN en la app.
- Rotar token: cambia `token_api` en hoja Config y actualiza secretos.
