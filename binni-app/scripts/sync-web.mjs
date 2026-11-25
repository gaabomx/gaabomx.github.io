// Copia la página web (binnibus/) dentro de la app y activa el modo app.
import fs from "node:fs";
import path from "node:path";
const src = path.resolve("../binnibus"), out = path.resolve("www");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
// Copia TODA la página (menos herramientas internas) para que la app quede idéntica a la web.
fs.cpSync(src, out, { recursive: true, filter: (p) => !/[\\/](tools|panel\.html|build\.html)$/.test(p) });
fs.copyFileSync(path.resolve("native.js"), path.join(out, "native.js"));
for (const f of ["index.html", "2d.html"]) {
  let html = fs.readFileSync(path.join(out, f), "utf8");
  html = html.replace("</body>", '<script src="native.js"></script>\n</body>');
  fs.writeFileSync(path.join(out, f), html);
}
console.log("web copiada a www/");
