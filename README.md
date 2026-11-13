# Mi Explotación

App web offline (PWA) para gestionar una explotación agrícola, ganadera y apícola: parcelas y mapa (PNOA, Catastro, SIGPAC), almacén, partes de trabajo, taller, combustible, ventas y facturas, jornada, agenda, informes PDF y exportaciones oficiales. Los datos se guardan en el propio dispositivo y, si se activa, se sincronizan con Supabase.

**App publicada:** https://alejandragri.github.io/AGRIOR/

## Instalar en el móvil

- **Android (Chrome):** abre la dirección, menú ⋮ → *Instalar aplicación* (o *Añadir a pantalla de inicio*).
- **iPhone (Safari):** abre la dirección, botón *Compartir* → *Añadir a pantalla de inicio*.

## Estructura

- `src/` — código fuente: `shell.html`, `extra.css`, `js/*.js` (un archivo por módulo), `vendor/` (Leaflet, jsPDF), `sw.js`, `manifest.webmanifest`, `icon.svg`.
- `build.sh` — compila `src/` en `dist/` (un solo `index.html` con las librerías locales) y en `build/artifact.html` (vista previa).
- `dist/` — la app compilada, lista para servir.

Cada push a la rama principal ejecuta `.github/workflows/pages.yml`, que vuelve a compilar y publica `dist/` en GitHub Pages con una versión nueva del service worker, para que los móviles cojan la actualización.

La clave de Supabase que lleva `src/js/sync.js` es la publicable (pensada para ir en el navegador). Nunca subas aquí la clave `service_role`.
