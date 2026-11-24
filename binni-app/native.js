// Funciones nativas de la app (solo se activan dentro de la app de iPhone).
(function () {
  const C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  const LN = C.Plugins.LocalNotifications;
  const HP = C.Plugins.Haptics;
  const SB = C.Plugins.StatusBar;
  const BG = C.Plugins.BackgroundGeolocation;
  let bgId = null;
  const ID_BAJADA = 1001, ID_LLEGADA = 1002, ID_AVISO = 1003;
  let permiso = false, ultimoAviso = 0;

  try { SB && SB.setOverlaysWebView({ overlay: true }); SB && SB.setStyle({ style: "DARK" }); } catch (e) {}

  async function pedirPermiso() {
    if (permiso || !LN) return permiso;
    try {
      const r = await LN.requestPermissions();
      permiso = r.display === "granted";
    } catch (e) {}
    return permiso;
  }
  async function cancelar(ids) {
    try { await LN.cancel({ notifications: ids.map(id => ({ id })) }); } catch (e) {}
  }
  async function programar(id, title, body, enMin) {
    if (!(await pedirPermiso())) return;
    await cancelar([id]);
    try {
      await LN.schedule({ notifications: [{
        id, title, body, sound: "default",
        schedule: enMin > 0 ? { at: new Date(Date.now() + enMin * 60000), allowWhileIdle: true } : undefined
      }] });
    } catch (e) {}
  }
  function vibrar(fuerte) {
    try { fuerte ? HP.notification({ type: "WARNING" }) : HP.impact({ style: "MEDIUM" }); } catch (e) {}
  }

  // La página llama a esta función en cada momento del viaje.
  window.bbNative = async function (evento, d) {
    if (evento === "start") {
      // ubicación en vivo aunque la pantalla esté bloqueada
      if (BG && !bgId && window.bbPos) {
        try {
          bgId = await BG.addWatcher({
            backgroundTitle: "Viaje en curso",
            backgroundMessage: "Te aviso en cada parada y cuando debas bajarte.",
            requestPermissions: true, stale: false, distanceFilter: 15
          }, (loc, err) => {
            if (err || !loc) return;
            window.bbPos({ coords: { latitude: loc.latitude, longitude: loc.longitude,
              accuracy: loc.accuracy, speed: loc.speed, heading: loc.bearing } });
          });
        } catch (e) {}
      }
      vibrar(false);
      await pedirPermiso();
    } else if (evento === "eta") {
      // Aviso programado: llega aunque tengas el celular bloqueado.
      // Se reprograma con cada actualización (máx. cada 30 s).
      if (Date.now() - ultimoAviso < 30000) return;
      ultimoAviso = Date.now();
      const antes = Math.max(0.5, d.alight - 2);
      await programar(ID_BAJADA, "🔔 Prepárate para bajar", `Ya casi llegas a ${d.stop}. Toca el timbre.`, antes);
      await programar(ID_LLEGADA, "🏁 Ya deberías estar llegando", `Hora estimada de llegada: ${d.eta}`, Math.max(1, d.min));
    } else if (evento === "warn") {
      vibrar(true);
      await programar(ID_AVISO, "🔔 ¡Prepárate!",
        d.change ? `Bájate en ${d.stop}: ahí cambias a la ${d.change}.` : `Bájate en ${d.stop}.`, 0);
    } else if (evento === "stop") {
      try { HP.impact({ style: "LIGHT" }); setTimeout(() => HP.impact({ style: "LIGHT" }), 150); } catch (e) {}
      if (document.visibilityState !== "visible")
        await programar(1004, "🚏 Parada cerca", `${d.name} · ${d.routes}`, 0);
    } else if (evento === "end") {
      if (BG && bgId) { try { await BG.removeWatcher({ id: bgId }); } catch (e) {} bgId = null; }
      ultimoAviso = 0;
      await cancelar([ID_BAJADA, ID_LLEGADA, ID_AVISO]);
    }
  };
})();
