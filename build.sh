#!/bin/bash
# Genera dist/ (PWA instalable, librerías locales) y build/artifact.html (vista previa con librerías de cdnjs)
set -e
cd "$(dirname "$0")"
JS="src/js/core.js src/js/inventario.js src/js/costes.js src/js/agenda.js src/js/adjuntos.js src/js/mapa.js src/js/sigpac.js src/js/pac.js src/js/tiempo.js src/js/informes.js src/js/guiado.js src/js/partes.js src/js/taller.js src/js/combustible.js src/js/hoy.js src/js/ventas.js src/js/jornada.js src/js/oficial.js src/js/voz.js src/js/sync.js src/js/zz-boot.js"
mkdir -p dist/vendor build
python3 - "$JS" <<'PY'
import sys, re
js = "\n".join(open(f).read() for f in sys.argv[1].split())
shell = open("src/shell.html").read()
css = open("src/extra.css").read() + "\n" + open("src/vendor/leaflet.css").read().replace("url(images/", "url(vendor/images/")
shell = shell.replace("</style>", css + "\n</style>", 1)
head_end = shell.index("</style>") + len("</style>")
head, body = shell[:head_end], shell[head_end:]
app = "<script>\n" + js + "\n</script>"
cdn = ('<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>\n'
       '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>\n'
       '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>\n')
local = ('<script src="vendor/leaflet.js"></script>\n<script src="vendor/jspdf.umd.min.js"></script>\n'
         '<script src="vendor/jspdf.plugin.autotable.min.js"></script>\n')
open("build/artifact.html","w").write(head + body.replace("<!--SCRIPTS-->", cdn + app))
doc = ('<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
       '<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icon.svg">\n<link rel="apple-touch-icon" href="icon.svg">\n'
       + head + '\n</head>\n<body>\n' + body.replace("<!--SCRIPTS-->", local + app) + '\n</body>\n</html>\n')
open("dist/index.html","w").write(doc)
PY
cp src/vendor/*.js dist/vendor/
cp src/icon.svg src/manifest.webmanifest dist/
V=$(date +%Y%m%d%H%M)
sed "s/__VERSION__/$V/" src/sw.js > dist/sw.js
node -e "new Function(require('fs').readFileSync('dist/index.html','utf8').split('<script>\n').pop().split('\n</script>')[0])" && echo "JS OK"
ls -la dist build
