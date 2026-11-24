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
rep('<script src="lib/leaflet.js"></script>', '''<script src="lib/maplibre-gl.js"></script>
<script>
/* Estilo 3D: satélite (lo agrega la página), relieve, edificios y negocios */
window.BB_GL = {
  pitch: 50,
  tilesBelow: "bb-buildings",
  attribution: "Imágenes © Esri · © OpenStreetMap · OpenFreeMap · Relieve © Mapzen/AWS",
  style: {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      ofm: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
      dem: { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], encoding: "terrarium", tileSize: 256, maxzoom: 14 }
    },
    sky: { "sky-color": "#88b4e6", "horizon-color": "#d8e6f2", "fog-color": "#d8e6f2", "sky-horizon-blend": .6, "horizon-fog-blend": .6, "fog-ground-blend": .85, "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 10, 1, 14, .4] },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#5b6450" } },
      { id: "bb-buildings", type: "fill-extrusion", source: "ofm", "source-layer": "building", minzoom: 14.5,
        paint: { "fill-extrusion-color": "#efe6d6",
          "fill-extrusion-height": ["max", 3, ["coalesce", ["get", "render_height"], 6]],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 14.5, 0, 15.5, .75] } },
      { id: "bb-poi-dot", type: "circle", source: "ofm", "source-layer": "poi", minzoom: 15,
        filter: ["has", "name"],
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 3, 18, 5],
          "circle-color": ["match", ["get", "class"],
            ["grocery", "shop", "convenience", "clothing_store", "hardware", "mobile_phone", "furniture"], "#f97316",
            ["restaurant", "fast_food", "cafe", "bar", "beer", "ice_cream", "bakery"], "#e11d48",
            ["hospital", "pharmacy", "doctors", "dentist"], "#dc2626",
            ["school", "college", "library", "kindergarten"], "#7c3aed",
            ["bank", "atm"], "#0f766e", ["fuel"], "#2563eb", ["place_of_worship"], "#6b7280",
            ["park", "playground", "garden"], "#16a34a", "#f59e0b"],
          "circle-stroke-color": "#fff", "circle-stroke-width": 1.2, "circle-pitch-alignment": "map" } },
      { id: "bb-poi-label", type: "symbol", source: "ofm", "source-layer": "poi", minzoom: 15,
        filter: ["has", "name"],
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": ["interpolate", ["linear"], ["zoom"], 15, 10.5, 18, 13],
          "text-anchor": "top", "text-offset": [0, .55], "text-max-width": 8, "symbol-sort-key": ["get", "rank"], "text-optional": true },
        paint: { "text-color": "#fff", "text-halo-color": "rgba(20,16,12,.85)", "text-halo-width": 1.4 } }
    ]
  },
  onLoad(gl) {
    try { gl.setTerrain({ source: "dem", exaggeration: 1.25 }); } catch (e) {}
  }
};
</script>
<script src="lib/leaflet-gl.js"></script>''')
rep('<script src="leaflet-rotate.js"></script>\n', '')

# 2) los marcadores no giran con el mapa en MapLibre: el cono va al revés
rep('so.querySelector(".cone").style.transform=`rotate(${HDGshow+b}deg)`', 'so.querySelector(".cone").style.transform=`rotate(${HDGshow-b}deg)`')

# 3) botón 2D / 3D
rep('<button class="fab compass" id="compass"', '<button class="fab dim" id="dimbtn" title="Cambiar vista 2D / 3D" aria-label="Vista 2D o 3D">2D</button>\n<button class="fab compass" id="compass"')
rep('.compass{display:none;', '.fab.dim{bottom:calc(58vh + 176px);font:800 14px Inter,system-ui,sans-serif;transition:bottom .28s}\n.maplibregl-popup-content{border-radius:12px;font:14px/1.4 Inter,system-ui,sans-serif;padding:10px 14px}\n.leaflet-tooltip{white-space:nowrap;border-radius:6px;pointer-events:none}\n.maplibregl-ctrl-attrib{font-size:10px}\n.compass{display:none;')
rep('$("compass").style.bottom=min?"calc(186px + env(safe-area-inset-bottom))":"calc(58vh + 122px)";',
    '$("compass").style.bottom=min?"calc(186px + env(safe-area-inset-bottom))":"calc(58vh + 122px)";$("dimbtn").style.bottom=min?"calc(240px + env(safe-area-inset-bottom))":"calc(58vh + 176px)";')
rep('map.on("rotate",upCompass);', '''map.on("rotate",upCompass);map.on("pitch",upCompass);
/* 2D / 3D */
function upDim(){$("dimbtn").textContent=map.getPitch()>5?"2D":"3D"}
$("dimbtn").onclick=()=>{const p=map.getPitch()>5;map.gl.easeTo({pitch:p?0:55,duration:700});setTimeout(upDim,720)};
map.on("pitch",upDim);''')
rep('function upCompass(){const b=map.getBearing?map.getBearing():0;const n=((b%360)+360)%360;',
    'function upCompass(){const b=map.getBearing?map.getBearing():0;const n=((b%360)+360)%360;try{upDim()}catch(e){}')
# el botón de norte también endereza la vista inclinada
rep('$("compass").classList.toggle("on",n>1&&n<359)', '$("compass").classList.toggle("on",(n>1&&n<359))')

open(dst, "w", encoding="utf-8").write(s)
print("ok ->", dst)
