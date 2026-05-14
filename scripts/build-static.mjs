import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = "dist/dashboard";
const indexPath = join(outDir, "index.html");
const remoteAssetPrefix = "https://bootstrapdemos.wrappixel.com/materialpro/dist/assets/";
const botDataScript = '<script src="/assets/js/bot-data.js"></script>';

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync("dashboard/public", outDir, { recursive: true });

let html = readFileSync("demo-clone/index.html", "utf8");
html = html.replaceAll(remoteAssetPrefix, "/assets/");
if (!html.includes(botDataScript)) {
  html = html.replace("</body>", `  ${botDataScript}\n</body>`);
}
writeFileSync(indexPath, html);

const indexSize = statSync(indexPath).size;
if (indexSize < 200_000) {
  throw new Error(`[build-static] dist/dashboard/index.html is only ${indexSize} bytes; expected the demo-clone HTML`);
}

if (!html.includes("M&eacute;triques Rapides") || html.includes('id="root"')) {
  throw new Error("[build-static] dist/dashboard/index.html does not look like the MaterialPro demo clone");
}

if (html.includes(remoteAssetPrefix)) {
  throw new Error("[build-static] dist/dashboard/index.html still contains bootstrapdemos asset URLs");
}

const requiredAssets = [
  "assets/css/styles.css",
  "assets/js/vendor.min.js",
  "assets/js/bot-data.js",
  "assets/libs/apexcharts/dist/apexcharts.min.js",
  "assets/libs/bootstrap/dist/js/bootstrap.bundle.min.js",
  "assets/libs/jvectormap/jquery-jvectormap.min.js",
  "assets/libs/simplebar/dist/simplebar.min.js",
  "assets/js/extra-libs/jvectormap/jquery-jvectormap-us-aea-en.js",
  "assets/js/theme/app.horizontal.init.js",
  "assets/js/theme/theme.js",
  "assets/js/theme/app.min.js",
  "assets/js/theme/sidebarmenu.js",
  "assets/js/theme/feather.min.js",
  "assets/js/dashboards/dashboard3.js",
  "assets/js/M\u00e9triques Rapides/highlight.min.js",
  "assets/images/backgrounds/material-pro-bg.png",
  "assets/images/backgrounds/make-social-media.png",
  "assets/images/profile/user-7.jpg",
  "assets/images/svgs/icon-flag-cn.svg",
  "assets/images/svgs/icon-flag-fr.svg",
  "assets/images/svgs/icon-flag-sa.svg"
];

const missingAssets = requiredAssets.filter((assetPath) => !existsSync(join(outDir, assetPath)));
if (missingAssets.length > 0) {
  throw new Error(`[build-static] missing required dashboard assets:\n${missingAssets.join("\n")}`);
}

console.log(`[build-static] done: ${indexSize} bytes`);
