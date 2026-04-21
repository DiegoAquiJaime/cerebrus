# Respaldo manual (inventario + facturas + pedido semanal)

El estado vive en el navegador (`localStorage`). Para copiarlo a tu Mac **antes de cambios importantes**:

1. Abre Cerebrus en el mismo navegador donde trabajas (Chrome o Firefox).
2. Inicia sesión como siempre.
3. Abre la **consola de desarrollador** (Chrome: `Cmd+Option+J` en Mac).
4. Pega y ejecuta:

```javascript
cereBackupNowAll()
```

5. En el cuadro que aparece:
   - **Aceptar** = eliges una carpeta y se guardan tres JSON dentro de la subcarpeta `respaldos rescates inventario` (inventario, facturas, estado completo con pedido semanal).
   - **Cancelar** = se **descargan** los mismos tres archivos a tu carpeta de Descargas.

Alternativa rápida (un solo archivo con todo el estado):

```javascript
archDownloadBackup()
```

Guarda esos archivos en un lugar seguro (por ejemplo una carpeta fuera del proyecto o en tu disco de respaldo).
