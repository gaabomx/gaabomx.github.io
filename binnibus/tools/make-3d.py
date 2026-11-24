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
  pitch: 55,
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
    try { gl.setSky({ "sky-color": "#9cc3ec", "horizon-color": "#e8eef4", "fog-color": "#eef1f4", "sky-horizon-blend": .7, "horizon-fog-blend": .5, "fog-ground-blend": .9, "atmosphere-blend": 0 }); } catch (e) {}
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
setTimeout(function(){try{if(!map._loaded)location.replace("2d.html"+location.search+location.hash)}catch(e){}},20000);</script>''')
rep('<script src="leaflet-rotate.js"></script>\n', '')

# 2) los marcadores no giran con el mapa en MapLibre: el cono va al revés
rep('so.querySelector(".cone").style.transform=`rotate(${HDGshow+b}deg)`', 'so.querySelector(".cone").style.transform=`rotate(${HDGshow-b}deg)`')

# 3) botón 2D / 3D
rep('<button class="fab compass" id="compass"', '<button class="fab dim" id="satbtn" title="Mapa o satélite" aria-label="Mapa o satélite" style="font-size:20px">🛰️</button>\n<button class="fab dim" id="dimbtn" title="Cambiar vista 2D / 3D" aria-label="Vista 2D o 3D">2D</button>\n<button class="fab compass" id="compass"')
rep('.compass{display:none;', '#satbtn{bottom:calc(58vh + 230px)}.fab.dim{bottom:calc(58vh + 176px);font:800 14px Inter,system-ui,sans-serif;transition:bottom .28s}\n.maplibregl-popup-content{border-radius:12px;font:14px/1.4 Inter,system-ui,sans-serif;padding:10px 14px}\n.leaflet-tooltip{white-space:nowrap;border-radius:6px;pointer-events:none}\n.maplibregl-ctrl-attrib{font-size:10px}\n.compass{display:none;')
rep('$("compass").style.bottom=min?"calc(186px + env(safe-area-inset-bottom))":"calc(58vh + 122px)";',
    '$("compass").style.bottom=min?"calc(186px + env(safe-area-inset-bottom))":"calc(58vh + 122px)";$("dimbtn").style.bottom=min?"calc(240px + env(safe-area-inset-bottom))":"calc(58vh + 176px)";$("satbtn").style.bottom=min?"calc(294px + env(safe-area-inset-bottom))":"calc(58vh + 230px)";')
rep('map.on("rotate",upCompass);', '''map.on("rotate",upCompass);map.on("pitch",upCompass);
/* 2D / 3D */
function upDim(){$("dimbtn").textContent=map.getPitch()>5?"2D":"3D"}
$("dimbtn").onclick=()=>{const p=map.getPitch()>5;map.gl.easeTo({pitch:p?0:55,duration:700});setTimeout(upDim,720)};
map.on("pitch",upDim);
function upSat(){$("satbtn").textContent=BB_GL.mode()==="sat"?"🗺️":"🛰️"}
$("satbtn").onclick=()=>{try{localStorage.setItem("bb-mapa",BB_GL.mode()==="sat"?"mapa":"sat")}catch(e){}map.refreshRasters();BB_GL.applyMode(map.gl);upSat()};upSat();''')
rep('function upCompass(){const b=map.getBearing?map.getBearing():0;const n=((b%360)+360)%360;',
    'function upCompass(){const b=map.getBearing?map.getBearing():0;const n=((b%360)+360)%360;try{upDim()}catch(e){}')
# el botón de norte también endereza la vista inclinada
rep('$("compass").classList.toggle("on",n>1&&n<359)', '$("compass").classList.toggle("on",(n>1&&n<359))')

s = s.replace("<!DOCTYPE html>", "<!DOCTYPE html>\n<!-- GENERADO por tools/make-3d.py desde 2d.html. Edita 2d.html y vuelve a correr el script. -->", 1)
open(dst, "w", encoding="utf-8").write(s)
print("ok ->", dst)
