// Copia la página web (binnibus/) dentro de la app y activa el modo app.
import fs from "node:fs";
import path from "node:path";
const src = path.resolve("../binnibus"), out = path.resolve("www");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ["index.html", "routes.js", "stops.js", "geo.json", "privacidad.html"]) fs.copyFileSync(path.join(src, f), path.join(out, f));
fs.copyFileSync(path.resolve("native.js"), path.join(out, "native.js"));
let html = fs.readFileSync(path.join(out, "index.html"), "utf8");
html = html.replace("</body>", '<script src="native.js"></script>\n</body>');
fs.writeFileSync(path.join(out, "index.html"), html);
console.log("web copiada a www/");
