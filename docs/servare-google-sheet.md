# Servare — inventario en otro Google Sheet

Inventario y bodega se guardan en un **Sheet separado** (mismo modelo que Cerebrus: HTML + Apps Script). Cerebrus sigue con facturas, SAC, etc. en su Sheet actual.

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

## 3. Publicar Web App

1. **Implementar → Nueva implementación**
2. Tipo: **Aplicación web**
3. Ejecutar como: **Yo**
4. Quién tiene acceso: **Cualquier persona** (igual que Cerebrus)
5. Copiá la URL que termina en `/exec`

## 4. Usuarios (login Bodega)

En la pestaña **Users** del Sheet Servare (se crea sola):

| user | passHash |
|------|----------|
| Bodega | *(vacío la primera vez; la app guarda el hash)* |

La primera vez que **Bodega** entra con contraseña en Cerebrus, si usás el mismo flujo `verifyPassword` contra Servare, hay que **configurar Servare como login** solo cuando Servare sea app aparte.  
**Por ahora** Cerebrus sigue autenticando en su Sheet; Servare solo guarda inventario.

Opcional: copiá la fila de hash de `Users` del Sheet Cerebrus a Servare para el usuario Bodega.

## 5. Conectar en Cerebrus

1. Abrí Cerebrus → **⚙ Configuración → 🗄 Mantenimiento**
2. Sección **Servare (inventario en otro Sheet)**
3. Pegá la URL `/exec` de Servare → **Guardar**
4. **Probar conexión**
5. **Migrar inventario desde Cerebrus** (una vez) — copia `pInv` actual al Sheet Servare
6. Activá **Usar Servare para inventario**

A partir de ahí:
- **Inventario** se lee/escribe en el Sheet Servare
- **Facturas, SAC, etc.** siguen en el Sheet Cerebrus
- Al guardar, Cerebrus **no envía** `pInv` a su Sheet

## 6. Verificar

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
