#!/usr/bin/env python3
"""Genera la versión 3D (MapLibre) de la página a partir de index.html (Leaflet).
Uso:  python3 binnibus/tools/make-3d.py ORIGEN DESTINO
Toda la lógica de la página es la misma; solo cambia el motor del mapa."""
import sys, re

src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding="utf-8").read()

def rep(old, new, count=1):
    global s
    if old not in s:
        sys.exit("No encontré en index.html: " + old[:80])
    s = s.replace(old, new, count)

# 1) motor del mapa: MapLibre + capa compatible con Leaflet
rep('<link rel="stylesheet" href="lib/leaflet.css">',
    '<link rel="stylesheet" href="lib/maplibre-gl.css">\n<link rel="preconnect" href="https://tiles.openfreemap.org" crossorigin>')
rep('<script src="lib/leaflet.js"></script>', '''<script>/* sin WebGL2 (celulares viejos) -> versión plana */
(function(){var ok=false;try{var c=document.createElement("canvas");ok=!!(window.WebGL2RenderingContext&&c.getContext("webgl2"))}catch(e){}
if(!ok||/[?&]plano/.test(location.search))location.replace("2d.html"+location.search+location.hash)})();</script>
<script src="lib/maplibre-gl.js"></script>
<script>
/* Estilo 3D: satélite (lo agrega la página), relieve, edificios y negocios */
window.BB_GL = {
  pitch: 45,
  tilesBelow: "building-3d",
  attribution: "© OpenStreetMap · OpenFreeMap · Imágenes © Esri",
  style: "https://tiles.openfreemap.org/styles/liberty",
  mode() { try { return localStorage.getItem("bb-mapa") || "mapa"; } catch (e) { return "mapa"; } },
  // satélite solo en modo satélite; las capas de nombres de Esri ya no hacen falta
  rasterVisible(url) { return /World_Imagery/.test(url) && window.BB_GL.mode() === "sat"; },
  onLoad(gl) {
    const NAME = ["coalesce", ["get", "name:es"], ["get", "name"]];
    const has = id => !!gl.getLayer(id);
    for (const l of gl.getStyle().layers) {
      if (l.type === "symbol" && l.layout && l.layout["text-field"] && !/shield/.test(l.id) && l.id !== "road_one_way_arrow")
        try { gl.setLayoutProperty(l.id, "text-field", NAME); } catch (e) {}
    }
    // edificios 3D desde más lejos y con altura mínima (en Oaxaca casi ninguno trae altura)
    if (has("building")) gl.setLayerZoomRange("building", 12, 14);
    if (has("building-3d")) {
      gl.setLayerZoomRange("building-3d", 14, 24);
      gl.setPaintProperty("building-3d", "fill-extrusion-height", ["max", 6, ["coalesce", ["get", "render_height"], 0]]);
      gl.setPaintProperty("building-3d", "fill-extrusion-base", ["coalesce", ["get", "render_min_height"], 0]);
      gl.setPaintProperty("building-3d", "fill-extrusion-color", ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 6], 6, "#e3dccf", 30, "#cfc6b8"]);
      gl.setPaintProperty("building-3d", "fill-extrusion-opacity", .92);
      gl.setPaintProperty("building-3d", "fill-extrusion-vertical-gradient", true);
    }
    // negocios: que salgan antes y se lean mejor
    [["poi_r1", 14.5], ["poi_r7", 15], ["poi_r20", 16]].forEach(([id, z]) => { if (!has(id)) return;
      gl.setLayerZoomRange(id, z, 24);
      gl.setLayoutProperty(id, "text-font", ["Noto Sans Bold"]);
      gl.setLayoutProperty(id, "text-size", 12);
      gl.setPaintProperty(id, "text-color", "#4b3f33"); gl.setPaintProperty(id, "text-halo-width", 1.5); });
    // las paradas de camión de OpenStreetMap se confunden con las del BinniBus: fuera
    if (has("poi_transit")) gl.setFilter("poi_transit", ["match", ["get", "class"], ["airport", "rail"], true, false]);
    // sin neblina en el horizonte (se veía difuminado arriba)
    try { gl.setSky({ "sky-color": "#8fbde8", "horizon-color": "#e6eff7", "fog-color": "#e6eff7", "sky-horizon-blend": .6, "horizon-fog-blend": .15, "fog-ground-blend": 1, "atmosphere-blend": 0 }); } catch (e) {}
    window.BB_GL.applyMode(gl);
  },
  applyMode(gl) {
    const sat = window.BB_GL.mode() === "sat", O = window.BB_GL._orig || (window.BB_GL._orig = {});
    for (const l of gl.getStyle().layers) { if (l.type !== "symbol") continue;
      if (!O[l.id]) O[l.id] = [gl.getPaintProperty(l.id, "text-color"), gl.getPaintProperty(l.id, "text-halo-color")];
      try { gl.setPaintProperty(l.id, "text-color", sat ? "#ffffff" : O[l.id][0]);
            gl.setPaintProperty(l.id, "text-halo-color", sat ? "rgba(20,16,12,.85)" : (O[l.id][1] || "#ffffff")); } catch (e) {} }
    if (gl.getLayer("building-3d")) gl.setPaintProperty("building-3d", "fill-extrusion-opacity", sat ? .55 : .92);
  }

};
</script>
<script src="lib/leaflet-gl.js"></script>
<script>/* si el mapa 3D no arranca (red lenta o bloqueada), pasar a la versión plana */
setTimeout(function(){try{if(!map._loaded&&navigator.onLine!==false)location.replace("2d.html"+location.search+location.hash)}catch(e){}},30000);</script>''')
rep('<script src="leaflet-rotate.js"></script>\n', '')

# 2) los marcadores no giran con el mapa en MapLibre: el cono va al revés
rep('so.querySelector(".cone").style.transform=`rotate(${HDGshow+b}deg)`', 'so.querySelector(".cone").style.transform=`rotate(${HDGshow-b}deg)`')

# 3) botón 2D / 3D
rep('<button class="fab compass" id="compass"', '<button class="fab dim" id="satbtn" title="Mapa o satélite" aria-label="Mapa o satélite" style="font-size:20px">🛰️</button>\n<button class="fab dim" id="dimbtn" title="Cambiar vista 2D / 3D" aria-label="Vista 2D o 3D">2D</button>\n<button class="fab compass" id="compass"')
rep('.compass{display:none;', '#map{background:#cfe2f3!important}\n#satbtn{bottom:calc(58vh + 176px);right:66px!important}body.fleft #satbtn{left:66px!important}.fab.dim{bottom:calc(58vh + 176px);font:800 14px Inter,system-ui,sans-serif;transition:bottom .28s}\n.maplibregl-popup-content{border-radius:12px;font:14px/1.4 Inter,system-ui,sans-serif;padding:10px 14px}\n.leaflet-tooltip{white-space:nowrap;border-radius:6px;pointer-events:none}\n.maplibregl-ctrl-attrib{font-size:10px}\n.compass{display:none;')
rep('$("compass").style.bottom=min?"calc(186px + env(safe-area-inset-bottom))":"calc(58vh + 122px)";',
    '$("compass").style.bottom=min?"calc(186px + env(safe-area-inset-bottom))":"calc(58vh + 122px)";$("dimbtn").style.bottom=min?"calc(240px + env(safe-area-inset-bottom))":"calc(58vh + 176px)";$("satbtn").style.bottom=$("dimbtn").style.bottom;')
rep('map.on("rotate",upCompass);', '''map.on("rotate",upCompass);map.on("pitch",upCompass);
/* 2D / 3D */
function upDim(){$("dimbtn").textContent=map.getPitch()>5?"2D":"3D"}
$("dimbtn").onclick=()=>{const p=map.getPitch()>5;map.gl.easeTo({pitch:p?0:45,duration:700});setTimeout(upDim,720)};
map.on("pitch",upDim);
function upSat(){$("satbtn").textContent=BB_GL.mode()==="sat"?"🗺️":"🛰️"}
$("satbtn").onclick=()=>{try{localStorage.setItem("bb-mapa",BB_GL.mode()==="sat"?"mapa":"sat")}catch(e){}map.refreshRasters();BB_GL.applyMode(map.gl);upSat();toast(BB_GL.mode()==="sat"?"🛰️ Vista satélite":"🗺️ Vista de mapa")};upSat();''')
rep('function upCompass(){const b=map.getBearing?map.getBearing():0;const n=((b%360)+360)%360;',
    'function upCompass(){const b=map.getBearing?map.getBearing():0;const n=((b%360)+360)%360;try{upDim()}catch(e){}')
# el botón de norte también endereza la vista inclinada
rep('$("compass").classList.toggle("on",n>1&&n<359)', '$("compass").classList.toggle("on",(n>1&&n<359))')

# 2d.html es la copia de respaldo y lleva noindex; la página pública (index.html) sí debe salir en Google
s = s.replace('<meta name="robots" content="noindex">\n', "", 1)
s = s.replace("<!DOCTYPE html>", "<!DOCTYPE html>\n<!-- GENERADO por tools/make-3d.py desde 2d.html. Edita 2d.html y vuelve a correr el script. -->", 1)
# evitar que el celular use versiones viejas guardadas (caché)
import hashlib, os
base = os.path.dirname(os.path.abspath(dst))
for f in ["lib/leaflet-gl.js", "lib/maplibre-gl.js", "lib/maplibre-gl.css", "routes.js", "stops.js"]:
    fp = os.path.join(base, f)
    if os.path.exists(fp):
        h = hashlib.md5(open(fp, "rb").read()).hexdigest()[:8]
        s = re.sub(r'(["\'])' + re.escape(f) + r'(\?v=[0-9a-f]+)?(["\'])', r'\g<1>' + f + '?v=' + h + r'\g<3>', s)
open(dst, "w", encoding="utf-8").write(s)
print("ok ->", dst)
