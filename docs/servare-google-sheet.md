# Servare — inventario en otro Google Sheet

Inventario y bodega se guardan en un **Sheet separado** (mismo modelo que Cerebrus: HTML + Apps Script). Cerebrus sigue con facturas, SAC, etc. en su Sheet actual.

## Modelo (igual que Cerebrus)

| Capa | Dónde vive | Cómo se actualiza |
|------|------------|-------------------|
| **App web** | Repo `Cerebrus` → [GitHub Pages](https://diegoaquijaime.github.io/cerebrus/) | `git commit` + `git push` (mismo `index.html`) |
| **API inventario (Servare)** | Google Apps Script + Sheet `Servare Inventario` | Copiar `servare/servare-apps-script.js` al editor → **Nueva versión** → Implementar |
| **API resto (Cerebrus)** | Apps Script del Sheet Cerebrus | Igual que siempre |

No hace falta un repo GitHub aparte para Servare: el código del backend está en este repo; los datos en Google Sheet.

La URL de Servare va embebida en `index.html` (`SERVARE_APPS_SCRIPT_EXEC`), igual que `APPS_SCRIPT_EXEC` de Cerebrus. Tras el push, todos los navegadores usan Servare sin pegar URL a mano (salvo que alguien lo desactive en Mantenimiento).

## 1. Crear el Google Sheet de Servare

1. [Google Sheets](https://sheets.google.com) → **Hoja de cálculo en blanco**
2. Nombre sugerido: `Servare Inventario`
3. No hace falta crear pestañas a mano; el script las crea.

## 2. Instalar Apps Script

1. En esa hoja: **Extensiones → Apps Script**
2. Borrá el contenido de `Code.gs`
3. Pegá todo el archivo [`servare/servare-apps-script.js`](../servare/servare-apps-script.js)
4. Guardá el proyecto (nombre: `Servare API`)
5. Menú **Ejecutar** → función `servareSetup` → autorizar permisos

## 3. Autorizar **antes** de publicar (evita Error 401 invalid_client)

Si al publicar sale *«The OAuth client was not found»* / **401 invalid_client**, casi siempre el proyecto Cloud no está bien vinculado. Hacé esto **en este orden**:

### 3.1 Ejecutar el script una vez desde el editor

1. En Apps Script, elegí la función **`servareSetup`** en el desplegable arriba.
2. Pulsá **Ejecutar** (▶).
3. La primera vez: **Revisar permisos** → tu cuenta → **Permitir** (acceso a la hoja).
4. En **Ejecuciones** debe decir *Completada* y en el Sheet deben aparecer pestañas `Meta`, `Part_pInv`, `Users`, `Log`.

No publiques la Web App hasta que este paso funcione.

### 3.2 Revisar proyecto Google Cloud vinculado

1. Apps Script → icono **⚙ Configuración del proyecto** (barra lateral izquierda).
2. Baja a **Proyecto de Google Cloud Platform (GCP)**.
3. Si el número de proyecto parece viejo o roto → **Cambiar proyecto**.
4. Opción más simple: **Usar proyecto predeterminado de GCP** (Google crea uno automático).
5. Opción manual: en [console.cloud.google.com](https://console.cloud.google.com) → **Nuevo proyecto** → nombre `Servare Inventario` → copiá el **Número de proyecto** (no el ID) → pegarlo en Apps Script.

### 3.3 Pantalla de consentimiento OAuth (solo si sigue fallando)

En Google Cloud Console del proyecto vinculado:

1. **APIs y servicios → Pantalla de consentimiento de OAuth**
2. Tipo **Externo** (o Interno si tenés Workspace).
3. Nombre de la app: `Servare`, correo de asistencia: el tuyo.
4. **Usuarios de prueba** → agregá `diego@aquijaime.cl` (y quien más vaya a autorizar).
5. Guardá. En uso personal basta con estado **Prueba**; no hace falta publicar en producción.

Volvé a Apps Script → ejecutá **`servareSetup`** otra vez → autorizá si pide.

## 4. Publicar Web App

1. **Implementar → Nueva implementación**
2. Tipo: **Aplicación web**
3. Ejecutar como: **Yo** (`diego@aquijaime.cl`)
4. Quién tiene acceso: **Cualquier persona** (igual que Cerebrus)
5. **Implementar** → copiá la URL que termina en `/exec`

### Probar que funciona

Abrí en el navegador (sin login):

`TU_URL/exec?action=ping`

Debe responder JSON: `{"ok":true,"service":"servare",...}`

## 5. Usuarios (login Bodega)

En la pestaña **Users** del Sheet Servare (se crea sola):

| user | passHash |
|------|----------|
| Bodega | *(vacío la primera vez; la app guarda el hash)* |

La primera vez que **Bodega** entra con contraseña en Cerebrus, si usás el mismo flujo `verifyPassword` contra Servare, hay que **configurar Servare como login** solo cuando Servare sea app aparte.  
**Por ahora** Cerebrus sigue autenticando en su Sheet; Servare solo guarda inventario.

Opcional: copiá la fila de hash de `Users` del Sheet Cerebrus a Servare para el usuario Bodega.

## 6. Conectar en Cerebrus

**Producción (GitHub Pages):** la URL ya está en el código; con el push activo, Servare queda **encendido por defecto**. Solo verificá en **⚙ Mantenimiento → Servare → Probar Servare**.

**Override local (opcional):** en Mantenimiento podés desactivar el checkbox o cambiar la URL (se guarda en `localStorage` de ese navegador).

**Migración inicial:** ya se cargó inventario bueno (respaldo 23-jun). **No uses** «Migrar inventario desde Cerebrus» salvo que sepas que el Sheet Cerebrus tiene datos correctos.

A partir de ahí:
- **Inventario** se lee/escribe en el Sheet Servare
- **Facturas, SAC, etc.** siguen en el Sheet Cerebrus
- Al guardar, Cerebrus **no envía** `pInv` a su Sheet

## 7. Verificar

| Prueba | Éxito |
|--------|--------|
| Probar conexión Servare | ✓ Servare conectado |
| Migrar inventario | KB copiados, filas en `Part_pInv` |
| Bodega guarda conteo | Solo cambia Sheet Servare |
| Diego guarda facturas | Sheet Cerebrus OK, inventario no se pisa |

## Rollback

En Mantenimiento: desactivá **Usar Servare**. Cerebrus vuelve a leer/guardar `pInv` en su Sheet original (si aún existe ahí).

## Archivos

| Archivo | Uso |
|---------|-----|
| `servare/servare-apps-script.js` | Código para Apps Script |
| `docs/servare-google-sheet.md` | Esta guía |
