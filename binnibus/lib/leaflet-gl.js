/* leaflet-gl.js — una capa "Leaflet" encima de MapLibre GL para el mapa 3D de BinniBus.
   Implementa solo lo que usa la página (map, tileLayer, polyline, circleMarker, circle,
   marker + divIcon, layerGroup, popup, tooltip, latLngBounds), con coordenadas [lat,lng]
   como Leaflet. Las líneas y círculos se dibujan como GeoJSON (se pegan al relieve). */
(function () {
  "use strict";
  const GL = window.maplibregl;
  const ZO = 1; // MapLibre usa mosaicos de 512 px: su zoom = zoom de Leaflet − 1
  const toLL = a => Array.isArray(a) ? [a[1], a[0]] : [a.lng, a.lat];
  const toLatLng = a => Array.isArray(a) ? { lat: a[0], lng: a[1] } : { lat: a.lat, lng: a.lng };
  const R = 6371000, rad = Math.PI / 180;
  const dist = (a, b) => { a = toLatLng(a); b = toLatLng(b);
    const dl = (b.lat - a.lat) * rad, dn = (b.lng - a.lng) * rad;
    const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dn / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h)); };

  class Evented {
    on(t, f) { t.split(" ").forEach(k => { (this._ev || (this._ev = {}))[k] = (this._ev[k] || []).concat(f); }); return this; }
    off(t, f) { if (this._ev && this._ev[t]) this._ev[t] = f ? this._ev[t].filter(x => x !== f && x._o !== f) : []; return this; }
    once(t, f) { const g = e => { this.off(t, g); f(e); }; g._o = f; return this.on(t, g); }
    fire(t, e) { ((this._ev && this._ev[t]) || []).slice().forEach(f => { try { f.call(this, e || {}); } catch (x) { console.error(x); } }); return this; }
    listens(t) { return !!(this._ev && this._ev[t] && this._ev[t].length); }
  }

  /* ---------- Almacén de figuras (una fuente GeoJSON por tipo) ---------- */
  let FID = 0, Z = 0;
  class Store {
    constructor(m) { this.m = m; this.lines = new Map(); this.circles = new Map(); this.stops = new Map(); this.imgs = new Set(); this.fills = new Map(); this.dashLayers = new Set(); this.dirty = false; this.ready = false; }
    init() {
      const g = this.m.gl;
      const empty = { type: "FeatureCollection", features: [] };
      g.addSource("lf-lines", { type: "geojson", data: empty, tolerance: 0.2 });
      g.addSource("lf-fills", { type: "geojson", data: empty });
      g.addSource("lf-circles", { type: "geojson", data: empty, promoteId: "id" });
      g.addLayer({ id: "lf-fill", type: "fill", source: "lf-fills",
        paint: { "fill-color": ["get", "fc"], "fill-opacity": ["get", "fo"] } });
      g.addLayer({ id: "lf-line", type: "line", source: "lf-lines", filter: ["==", ["get", "dash"], ""],
        layout: { "line-cap": "round", "line-join": "round", "line-sort-key": ["get", "z"] },
        paint: { "line-color": ["get", "c"], "line-width": ["get", "w"], "line-opacity": ["get", "o"] } });
      g.addLayer({ id: "lf-circle", type: "circle", source: "lf-circles",
        layout: { "circle-sort-key": ["get", "z"] },
        paint: { "circle-radius": ["get", "r"], "circle-color": ["get", "fc"], "circle-opacity": ["get", "fo"],
          "circle-stroke-color": ["get", "c"], "circle-stroke-width": ["get", "w"], "circle-stroke-opacity": ["get", "o"],
          "circle-pitch-alignment": "map" } });
      g.addSource("lf-stops", { type: "geojson", data: empty });
      g.addLayer({ id: "lf-stop", type: "symbol", source: "lf-stops",
        layout: { "icon-image": ["get", "img"], "icon-size": ["interpolate", ["linear"], ["zoom"], 12, .55, 15, .8, 18, 1.05],
          "icon-allow-overlap": true, "icon-ignore-placement": true, "symbol-sort-key": ["get", "z"], "icon-pitch-alignment": "viewport" } });
      this.ready = true; this.flush();
    }
    dashLayer(dash, w) {
      const id = "lf-dash-" + dash.replace(/\s+/g, "_") + "-" + w;
      if (this.dashLayers.has(id)) return; this.dashLayers.add(id);
      const arr = dash.trim().split(/[\s,]+/).map(Number).map(v => Math.max(0.01, v / w));
      const go = () => this.m.gl.addLayer({ id, type: "line", source: "lf-lines",
        filter: ["all", ["==", ["get", "dash"], dash], ["==", ["get", "w"], w]],
        layout: { "line-cap": "round", "line-join": "round", "line-sort-key": ["get", "z"] },
        paint: { "line-color": ["get", "c"], "line-width": w, "line-opacity": ["get", "o"], "line-dasharray": arr } }, "lf-circle");
      this.ready ? go() : this.m._q.push(go);
    }
    touch() { if (this.dirty) return; this.dirty = true; requestAnimationFrame(() => this.flush()); }
    flush() {
      this.dirty = false; if (!this.ready) return;
      const g = this.m.gl, fc = map => ({ type: "FeatureCollection", features: [...map.values()] });
      g.getSource("lf-lines").setData(fc(this.lines));
      g.getSource("lf-fills").setData(fc(this.fills));
      g.getSource("lf-circles").setData(fc(this.circles));
      g.getSource("lf-stops").setData(fc(this.stops));
    }
  }

  /* letrero de parada: cuadrito blanco con borde y camión del color de la ruta */
  function stopImg(m, col) {
    const id = "stop-" + col; if (m.store.imgs.has(id)) return id; m.store.imgs.add(id);
    const r = 2, W = 26 * r, c = document.createElement("canvas"); c.width = c.height = W; const x = c.getContext("2d");
    const rr = (a, b, w, h, k) => { x.beginPath(); x.moveTo(a + k, b); x.arcTo(a + w, b, a + w, b + h, k); x.arcTo(a + w, b + h, a, b + h, k); x.arcTo(a, b + h, a, b, k); x.arcTo(a, b, a + w, b, k); x.closePath(); };
    x.shadowColor = "rgba(0,0,0,.35)"; x.shadowBlur = 3 * r; x.shadowOffsetY = r;
    rr(2 * r, 2 * r, 22 * r, 22 * r, 6 * r); x.fillStyle = "#fff"; x.fill(); x.shadowColor = "transparent";
    x.lineWidth = 2.4 * r; x.strokeStyle = col; x.stroke();
    // camión
    x.fillStyle = col; rr(7.5 * r, 6.5 * r, 11 * r, 11 * r, 2.4 * r); x.fill();
    x.fillStyle = "#fff"; rr(9 * r, 8.2 * r, 8 * r, 4.2 * r, 1 * r); x.fill();
    x.beginPath(); x.arc(10.3 * r, 15 * r, 1 * r, 0, 7); x.arc(15.7 * r, 15 * r, 1 * r, 0, 7); x.fill();
    x.fillStyle = col; x.fillRect(9 * r, 17.3 * r, 2 * r, 2 * r); x.fillRect(15 * r, 17.3 * r, 2 * r, 2 * r);
    const add = () => { try { if (!m.gl.hasImage(id)) m.gl.addImage(id, x.getImageData(0, 0, W, W), { pixelRatio: r }); } catch (e) {} };
    m._loaded ? add() : m._q.unshift(add); return id;
  }

  /* ---------- Mapa ---------- */
  class LMap extends Evented {
    constructor(id, o) {
      super(); o = o || {};
      this._q = []; this._layers = new Set(); this._popups = new Set(); this._loaded = false;
      const S = window.BB_GL || {};
      this.gl = new GL.Map({ container: id, style: S.style || { version: 8, sources: {}, layers: [] },
        center: [-96.7266, 17.0654], zoom: 13, pitch: S.pitch || 0, bearing: 0, maxPitch: 60,
        attributionControl: false, fadeDuration: 150, pitchWithRotate: true, dragRotate: true,
        touchPitch: true, cooperativeGestures: false });
      this.gl.addControl(new GL.AttributionControl({ compact: true, customAttribution: S.attribution || "" }), "bottom-left");
      this.store = new Store(this);
      this.gl.on("load", () => {
        try { S.onLoad && S.onLoad(this.gl); } catch (e) { console.error(e); }
        this.store.init(); this._loaded = true;
        const q = this._q; this._q = []; q.forEach(f => { try { f(); } catch (e) { console.error(e); } });
        this.fire("load");
      });
      // clics: primero las figuras (paradas), luego el mapa
      this.gl.on("click", e => {
        const oe = e.originalEvent;
        if (oe && oe.target && oe.target.closest && oe.target.closest(".maplibregl-marker,.maplibregl-popup")) return;
        const ev = { latlng: { lat: e.lngLat.lat, lng: e.lngLat.lng }, originalEvent: oe, _stop: false };
        if (this._loaded) {
          const p = e.point, t = 8;
          const hits = this.gl.queryRenderedFeatures([[p.x - t, p.y - t], [p.x + t, p.y + t]], { layers: ["lf-circle", "lf-stop"] });
          let best = null, bd = 1e9;
          for (const h of hits) { const o = FIG.get(h.properties.id); if (!o || !o._clickable()) continue;
            const q = this.gl.project(h.geometry.coordinates), d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2; if (d < bd) { bd = d; best = o; } }
          if (best) { best._click(ev); if (ev._stop || best._popup) return; }
        }
        this.fire("click", ev);
      });
      this.gl.on("mousemove", e => { if (!this._loaded) return; const p = e.point, t = 6;
        const h = this.gl.queryRenderedFeatures([[p.x - t, p.y - t], [p.x + t, p.y + t]], { layers: ["lf-circle", "lf-stop"] }).some(f => { const o = FIG.get(f.properties.id); return o && o._clickable(); });
        this.gl.getCanvas().style.cursor = h ? "pointer" : ""; });
      ["zoomend", "dragstart", "moveend", "movestart", "rotate", "pitch", "zoom", "move", "dragend"].forEach(k => this.gl.on(k, () => this.fire(k)));
    }
    whenReady(f) { this._loaded ? f() : this._q.push(f); return this; }
    setView(c, z) { const o = { center: toLL(c) }; if (z != null) o.zoom = z - ZO; this.gl.jumpTo(o); return this; }
    flyTo(c, z, o) { o = o || {}; this.gl.flyTo({ center: toLL(c), zoom: z != null ? z - ZO : this.gl.getZoom(), duration: (o.duration != null ? o.duration : 1) * 1000, essential: true }); return this; }
    panTo(c, o) { o = o || {}; this.gl.easeTo({ center: toLL(c), duration: o.animate === false ? 0 : (o.duration || .4) * 1000 }); return this; }
    _bpad(o) { o = o || {}; const p = o.padding || [20, 20], br = o.paddingBottomRight || [0, 0];
      const top = p[1], left = p[0], right = p[0] + (br[0] || 0), bottom = p[1] + (br[1] || 0);
      const W = this.gl.getContainer().clientWidth, H = this.gl.getContainer().clientHeight;
      const k = Math.min(1, (W - 40) / Math.max(1, left + right), (H - 40) / Math.max(1, top + bottom));
      return { top: top * k, left: left * k, right: right * k, bottom: bottom * k }; }
    _fit(b, o, dur) { o = o || {}; const g = this.gl, bearing = g.getBearing();
      // al encuadrar con el panel abierto, menos inclinación para que no se vea el horizonte
      const pitch = Math.min(g.getPitch(), (o.paddingBottomRight && o.paddingBottomRight[1] > 150) ? 30 : 45);
      const cam = g.cameraForBounds(b._gl(), { padding: this._bpad(o), bearing, maxZoom: (o.maxZoom || 18) - ZO });
      if (!cam) return this;
      const z = Math.min((o.maxZoom || 18) - ZO, cam.zoom - (pitch > 5 ? 0.35 + pitch / 200 : 0));
      g.flyTo({ center: cam.center, zoom: z, bearing, pitch, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: dur, essential: true }); return this; }
    fitBounds(b, o) { return this._fit(b, o, 600); }
    flyToBounds(b, o) { o = o || {}; return this._fit(b, o, (o.duration != null ? o.duration : .8) * 1000); }
    getZoom() { return this.gl.getZoom() + ZO; }
    setZoom(z) { this.gl.easeTo({ zoom: z - ZO }); return this; }
    getCenter() { const c = this.gl.getCenter(); return { lat: c.lat, lng: c.lng }; }
    getBearing() { return this.gl.getBearing(); }
    setBearing(b) { this.gl.setBearing(b); return this; }
    getPitch() { return this.gl.getPitch(); }
    latLngToContainerPoint(c) { const p = this.gl.project(toLL(c)); return { x: p.x, y: p.y }; }
    getSize() { const e = this.gl.getContainer(); return { x: e.clientWidth, y: e.clientHeight }; }
    distance(a, b) { return dist(a, b); }
    closePopup() { this._popups.forEach(p => p.remove()); this._popups.clear(); return this; }
    hasLayer(l) { return !!l && l._map === this; }
    addLayer(l) { l.addTo(this); return this; }
    removeLayer(l) { if (l && l._map === this) l.remove(); return this; }
    invalidateSize() { this.gl.resize(); return this; }
    /* línea seleccionada: se dibuja de punta a punta, brilla y lleva flechitas que fluyen */
    selShow(lines, col) { this.whenReady(() => { const g = this.gl; this.selClear(true);
      const fc = { type: "FeatureCollection", features: lines.map(l => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: l.map(toLL) } })) };
      g.addSource("sel", { type: "geojson", data: fc, lineMetrics: true });
      const below = g.getLayer("lf-circle") ? "lf-circle" : undefined, lay = { "line-cap": "round", "line-join": "round" };
      const grad = (c, p) => ["step", ["line-progress"], c, Math.max(0.0001, Math.min(1, p)), "rgba(0,0,0,0)"];
      g.addLayer({ id: "sel-glow", type: "line", source: "sel", layout: lay, paint: { "line-width": 22, "line-blur": 10, "line-gradient": grad(col, 0), "line-opacity": .55 } }, below);
      g.addLayer({ id: "sel-case", type: "line", source: "sel", layout: lay, paint: { "line-width": 13, "line-gradient": grad("#ffffff", 0) } }, below);
      g.addLayer({ id: "sel-main", type: "line", source: "sel", layout: lay, paint: { "line-width": 8, "line-gradient": grad(col, 0) } }, below);
      g.addLayer({ id: "sel-flow", type: "line", source: "sel", layout: { "line-cap": "butt", "line-join": "round" }, paint: { "line-width": 3, "line-color": "#ffffff", "line-opacity": 0, "line-dasharray": [0, 4, 3] } }, below);
      const t0 = performance.now(), DUR = 1100; const seq = [[0,4,3],[.5,4,2.5],[1,4,2],[1.5,4,1.5],[2,4,1],[2.5,4,.5],[3,4,0],[0,.5,3,3.5],[0,1,3,3],[0,1.5,3,2.5],[0,2,3,2],[0,2.5,3,1.5],[0,3,3,1],[0,3.5,3,.5]];
      let k = 0, last = 0;
      const step = t => { if (!g.getLayer("sel-main")) return; const e = Math.min(1, (t - t0) / DUR), p = 1 - Math.pow(1 - e, 3);
        if (e < 1) { g.setPaintProperty("sel-glow", "line-gradient", grad(col, p)); g.setPaintProperty("sel-case", "line-gradient", grad("#ffffff", p)); g.setPaintProperty("sel-main", "line-gradient", grad(col, p)); }
        else if (!this._selDone) { this._selDone = 1; g.setPaintProperty("sel-flow", "line-opacity", .95); }
        if (e >= 1) { g.setPaintProperty("sel-glow", "line-opacity", .35 + .25 * Math.sin((t - t0) / 380));
          if (t - last > 70) { last = t; g.setPaintProperty("sel-flow", "line-dasharray", seq[k = (k + 1) % seq.length]); } }
        this._selRAF = requestAnimationFrame(step); };
      this._selDone = 0; this._selRAF = requestAnimationFrame(step); }); return this; }
    selClear() { cancelAnimationFrame(this._selRAF); const g = this.gl; if (!g || !g.getStyle()) return this;
      ["sel-flow", "sel-main", "sel-case", "sel-glow"].forEach(id => { if (g.getLayer(id)) g.removeLayer(id); }); if (g.getSource("sel")) g.removeSource("sel"); return this; }
    refreshRasters() { const f = window.BB_GL && window.BB_GL.rasterVisible; if (!f) return this;
      this._layers.forEach(l => { if (l._sid && l.url && this.gl.getLayer(l._sid)) this.gl.setLayoutProperty(l._sid, "visibility", f(l.url) ? "visible" : "none"); }); return this; }
  }

  /* ---------- Capas ---------- */
  class Layer extends Evented {
    addTo(t) {
      if (t instanceof LayerGroup) { t._add(this); return this; }
      if (this._map === t) return this;
      if (this._map) this.remove();
      this._map = t; t._layers.add(this); this._onAdd(t); return this;
    }
    remove() { if (this._group) { this._group._del(this); } if (!this._map) return this; const m = this._map; this._onRemove(m); m._layers.delete(this); this._map = null; this._tip && this._tip.remove(); return this; }
    removeFrom() { return this.remove(); }
    bindPopup(h) { this._popup = h; return this; }
    unbindPopup() { this._popup = null; return this; }
    bindTooltip(t, o) { this._tipTxt = t; this._tipO = o || {}; if (this._map) this._showTip(); return this; }
    openPopup(ll) { if (!this._map || this._popup == null) return this; const m = this._map; m.closePopup();
      const p = new GL.Popup({ closeButton: true, maxWidth: "280px", offset: 10 }).setLngLat(toLL(ll || this._anchor())).setHTML(typeof this._popup === "function" ? this._popup(this) : this._popup).addTo(m.gl);
      m._popups.add(p); p.on("close", () => m._popups.delete(p)); return this; }
    _click(ev) { this.fire("click", ev); if (this._popup != null && !ev._stop) this.openPopup(); }
    _clickable() { return this.listens("click") || this._popup != null; }
    _showTip() {
      if (this._tip) this._tip.remove(); if (this._tipTxt == null || !this._map) return;
      const el = document.createElement("div"); el.className = "leaflet-tooltip " + (this._tipO.className || ""); el.textContent = this._tipTxt;
      const dir = this._tipO.direction || "right", r = (this._r || 0) + 6;
      const A = { right: ["left", [r, 0]], left: ["right", [-r, 0]], top: ["bottom", [0, -r]], bottom: ["top", [0, r]], center: ["center", [0, 0]] }[dir] || ["left", [r, 0]];
      this._tip = new GL.Marker({ element: el, anchor: A[0], offset: A[1] }).setLngLat(toLL(this._anchor())).addTo(this._map.gl);
    }
    _onAdd() { } _onRemove() { }
  }

  class LayerGroup extends Layer {
    constructor(ls) { super(); this._kids = new Set(); (ls || []).forEach(l => this._add(l)); }
    _add(l) { if (l._group && l._group !== this) l._group._del(l); l._group = this; this._kids.add(l); if (this._map) l.addTo(this._map); }
    _del(l) { this._kids.delete(l); l._group = null; }
    addLayer(l) { this._add(l); return this; }
    removeLayer(l) { if (this._kids.has(l)) { const g = l._group; l._group = null; this._kids.delete(l); l._map && Layer.prototype.remove.call(l); } return this; }
    hasLayer(l) { return this._kids.has(l); }
    clearLayers() { [...this._kids].forEach(l => { l._group = null; l._map && Layer.prototype.remove.call(l); }); this._kids.clear(); return this; }
    eachLayer(f) { this._kids.forEach(f); return this; }
    getLayers() { return [...this._kids]; }
    _onAdd(m) { this._kids.forEach(l => { const g = l._group; Layer.prototype.addTo.call(l, m); l._group = g; }); }
    _onRemove() { this._kids.forEach(l => { const g = l._group; l._group = null; l._map && Layer.prototype.remove.call(l); l._group = g; }); }
    remove() { const g = this._group; if (g) g._del(this); if (!this._map) return this; const m = this._map; this._onRemove(m); m._layers.delete(this); this._map = null; return this; }
  }

  const FIG = new Map();
  class Path extends Layer {
    constructor(o) { super(); this.options = Object.assign({ color: "#3388ff", weight: 3, opacity: 1, fillOpacity: .2 }, o || {}); this._id = ++FID; this._z = ++Z; FIG.set(this._id, this); }
    setStyle(o) { Object.assign(this.options, o || {}); this._upd(); return this; }
    bringToFront() { this._z = ++Z; this._upd(); return this; }
    getElement() { return null; }
    _onAdd() { this._upd(); this._tipTxt != null && this._showTip(); }
    _onRemove(m) { this._del(m); }
  }

  class Polyline extends Path {
    constructor(lls, o) { super(o); this._lls = (lls || []).map(toLatLng); }
    setLatLngs(l) { this._lls = l.map(toLatLng); this._upd(); if (this._tip) this._tip.setLngLat(toLL(this._anchor())); return this; }
    getLatLngs() { return this._lls.slice(); }
    _anchor() { const l = this._lls; return l.length ? l[Math.floor(l.length / 2)] : { lat: 0, lng: 0 }; }
    _feat() { const o = this.options, dash = o.dashArray ? String(o.dashArray) : "";
      return { type: "Feature", id: this._id, properties: { id: this._id, c: o.color, w: o.weight, o: o.opacity, dash, z: this._z },
        geometry: { type: "LineString", coordinates: this._lls.map(toLL) } }; }
    _upd() { const m = this._map; if (!m) return; const o = this.options; if (o.dashArray) m.store.dashLayer(String(o.dashArray), o.weight);
      if (this._lls.length < 2) m.store.lines.delete(this._id); else m.store.lines.set(this._id, this._feat()); m.store.touch(); }
    _del(m) { m.store.lines.delete(this._id); m.store.touch(); }
  }

  class CircleMarker extends Path {
    constructor(ll, o) { super(Object.assign({ radius: 10, fillOpacity: .2 }, o)); this._ll = toLatLng(ll); this._r = this.options.radius; }
    getLatLng() { return Object.assign({}, this._ll); }
    setLatLng(ll) { this._ll = toLatLng(ll); this._upd(); if (this._tip) this._tip.setLngLat(toLL(this._ll)); return this; }
    setRadius(r) { this.options.radius = this._r = r; this._upd(); return this; }
    getRadius() { return this.options.radius; }
    _anchor() { return this._ll; }
    _upd() { const m = this._map; if (!m) return; const o = this.options;
      if (o.stop) { m.store.stops.set(this._id, { type: "Feature", properties: { id: this._id, img: stopImg(m, o.fillColor || o.color), z: this._z },
        geometry: { type: "Point", coordinates: toLL(this._ll) } }); m.store.touch(); return; }
      m.store.circles.set(this._id, { type: "Feature", id: this._id, properties: { id: this._id, r: o.radius, fc: o.fillColor || o.color, fo: o.fillOpacity, c: o.color, w: o.weight, o: o.opacity, z: this._z },
        geometry: { type: "Point", coordinates: toLL(this._ll) } }); m.store.touch(); }
    _del(m) { m.store.circles.delete(this._id); m.store.stops.delete(this._id); m.store.touch(); }
  }

  // círculo en metros (precisión del GPS)
  class Circle extends Path {
    constructor(ll, o) { super(o); this._ll = toLatLng(ll); }
    getLatLng() { return Object.assign({}, this._ll); }
    setLatLng(ll) { this._ll = toLatLng(ll); this._upd(); return this; }
    setRadius(r) { this.options.radius = r; this._upd(); return this; }
    _anchor() { return this._ll; }
    _ring() { const r = this.options.radius || 10, c = this._ll, n = 48, out = [];
      for (let i = 0; i <= n; i++) { const a = i / n * 2 * Math.PI; out.push([c.lng + r * Math.sin(a) / (111320 * Math.cos(c.lat * rad)), c.lat + r * Math.cos(a) / 110540]); } return out; }
    _upd() { const m = this._map; if (!m) return; const o = this.options, ring = this._ring();
      m.store.fills.set(this._id, { type: "Feature", properties: { fc: o.fillColor || o.color, fo: o.fillOpacity }, geometry: { type: "Polygon", coordinates: [ring] } });
      m.store.lines.set(this._id, { type: "Feature", properties: { id: this._id, c: o.color, w: o.weight, o: o.opacity, dash: "", z: this._z }, geometry: { type: "LineString", coordinates: ring } });
      m.store.touch(); }
    _del(m) { m.store.fills.delete(this._id); m.store.lines.delete(this._id); m.store.touch(); }
  }

  /* ---------- Marcadores HTML ---------- */
  class DivIcon { constructor(o) { this.options = o || {}; } }
  class Marker extends Layer {
    constructor(ll, o) { super(); this.options = o || {}; this._ll = toLatLng(ll); }
    _build() {
      const ic = (this.options.icon && this.options.icon.options) || {}, sz = ic.iconSize || [24, 24], an = ic.iconAnchor || [sz[0] / 2, sz[1] / 2];
      const el = document.createElement("div"); el.className = ic.className || ""; el.style.width = sz[0] + "px"; el.style.height = sz[1] + "px";
      el.innerHTML = ic.html || ""; if (this.options.zIndexOffset) el.style.zIndex = 10 + Math.round(this.options.zIndexOffset / 10);
      el.addEventListener("click", e => { e.stopPropagation(); const ev = { latlng: this.getLatLng(), originalEvent: e, _stop: false }; this._click(ev); });
      this._el = el;
      this._mk = new GL.Marker({ element: el, anchor: "top-left", offset: [-an[0], -an[1]], pitchAlignment: "viewport", rotationAlignment: "viewport" });
    }
    _onAdd(m) { if (!this._mk) this._build(); this._mk.setLngLat(toLL(this._ll)).addTo(m.gl); this._tipTxt != null && this._showTip(); }
    _onRemove() { this._mk && this._mk.remove(); }
    _anchor() { return this._ll; }
    getLatLng() { return Object.assign({}, this._ll); }
    setLatLng(ll) { this._ll = toLatLng(ll); this._mk && this._mk.setLngLat(toLL(this._ll)); this._tip && this._tip.setLngLat(toLL(this._ll)); return this; }
    setIcon(i) { this.options.icon = i; const m = this._map; if (m) { this._mk.remove(); this._mk = null; this._build(); this._onAdd(m); } return this; }
    getElement() { if (!this._mk) this._build(); return this._el; }
    setZIndexOffset(z) { this.options.zIndexOffset = z; if (this._el) this._el.style.zIndex = 10 + Math.round(z / 10); return this; }
  }

  class Popup {
    constructor(o) { this.o = o || {}; this._ll = null; this._html = ""; }
    setLatLng(ll) { this._ll = toLatLng(ll); return this; }
    setContent(h) { this._html = h; return this; }
    openOn(m) { m.closePopup(); const p = new GL.Popup({ closeButton: true, maxWidth: "300px" }).setLngLat(toLL(this._ll)).setHTML(this._html).addTo(m.gl);
      m._popups.add(p); p.on("close", () => m._popups.delete(p)); this._p = p; return this; }
    remove() { this._p && this._p.remove(); return this; }
  }

  class TileLayer extends Layer {
    constructor(url, o) { super(); this.url = url; this.options = o || {}; this._sid = "lf-tile-" + (++FID); }
    _onAdd(m) { m.whenReady(() => {
      const g = m.gl; if (g.getSource(this._sid)) return;
      g.addSource(this._sid, { type: "raster", tiles: [this.url.replace("{s}", "a")], tileSize: 256, maxzoom: this.options.maxNativeZoom || this.options.maxZoom || 19 });
      const below = (window.BB_GL && window.BB_GL.tilesBelow && g.getLayer(window.BB_GL.tilesBelow)) ? window.BB_GL.tilesBelow : "lf-fill";
      const V = window.BB_GL && window.BB_GL.rasterVisible ? window.BB_GL.rasterVisible(this.url) : true;
      g.addLayer({ id: this._sid, type: "raster", source: this._sid, layout: { visibility: V ? "visible" : "none" }, paint: { "raster-opacity": this.options.opacity != null ? this.options.opacity : 1, "raster-fade-duration": 200 } }, below);
      const done = () => { this.fire("load"); };
      g.once("idle", done);
    }); }
    _onRemove(m) { const g = m.gl; if (g.getLayer(this._sid)) g.removeLayer(this._sid); if (g.getSource(this._sid)) g.removeSource(this._sid); }
  }

  class LatLngBounds {
    constructor(a) { this.pts = []; (a || []).forEach(p => this.extend(p)); }
    extend(p) { if (p instanceof LatLngBounds) p.pts.forEach(q => this.pts.push(q)); else this.pts.push(toLatLng(p)); return this; }
    isValid() { return this.pts.length > 0; }
    _gl() { const b = new GL.LngLatBounds(); this.pts.forEach(p => b.extend([p.lng, p.lat])); return b; }
  }

  window.L = {
    version: "gl-shim",
    map: (id, o) => new LMap(id, o),
    tileLayer: (u, o) => new TileLayer(u, o),
    polyline: (l, o) => new Polyline(l, o),
    circleMarker: (l, o) => new CircleMarker(l, o),
    circle: (l, o) => new Circle(l, o),
    marker: (l, o) => new Marker(l, o),
    divIcon: o => new DivIcon(o),
    layerGroup: l => new LayerGroup(l),
    featureGroup: l => new LayerGroup(l),
    popup: o => new Popup(o),
    latLngBounds: a => new LatLngBounds(a),
    latLng: (a, b) => b != null ? { lat: a, lng: b } : toLatLng(a),
    svg: () => ({}), canvas: () => ({}),
    DomEvent: { stop(e) { if (e) { e._stop = true; e.originalEvent && e.originalEvent.stopPropagation && e.originalEvent.stopPropagation(); } },
      stopPropagation(e) { if (e) e._stop = true; }, preventDefault(e) { e && e.preventDefault && e.preventDefault(); } },
    Browser: { mobile: /Mobi|Android|iPhone/.test(navigator.userAgent) }
  };
})();
