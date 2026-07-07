/**
 * Extension Build Script
 * Compiles TypeScript/TSX files for the Chrome Extension
 */
import { build } from "esbuild";
import fs from "fs";
import path from "path";

const outDir = "dist/extension";

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const staticFiles = [
  "extension/manifest.json",
  "extension/content-style.css",
];

for (const file of staticFiles) {
  const dest = path.join(outDir, path.basename(file));
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, dest);
    console.log(`Copied ${file} -> ${dest}`);
  }
}

if (fs.existsSync("extension/icons")) {
  const iconsOut = path.join(outDir, "icons");
  if (!fs.existsSync(iconsOut)) fs.mkdirSync(iconsOut);
  for (const icon of fs.readdirSync("extension/icons")) {
    fs.copyFileSync(path.join("extension/icons", icon), path.join(iconsOut, icon));
  }
  console.log("Copied icons");
}

if (!fs.existsSync(path.join(outDir, "popup"))) {
  fs.mkdirSync(path.join(outDir, "popup"), { recursive: true });
}
fs.copyFileSync("extension/popup/index.html", path.join(outDir, "popup", "index.html"));
console.log("Copied popup/index.html");

build({
  entryPoints: ["extension/content-script.ts"],
  bundle: true,
  outfile: `${outDir}/content-script.js`,
  platform: "browser",
  target: "chrome108",
  format: "iife",
  minify: true,
}).then(() => console.log("Built content-script.js"));

build({
  entryPoints: ["extension/background.ts"],
  bundle: true,
  outfile: `${outDir}/background.js`,
  platform: "browser",
  target: "chrome108",
  format: "esm",
  minify: true,
}).then(() => console.log("Built background.js"));

build({
  entryPoints: ["extension/popup/popup.tsx"],
  bundle: true,
  outfile: `${outDir}/popup/popup.js`,
  platform: "browser",
  target: "chrome108",
  format: "esm",
  minify: true,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
}).then(() => console.log("Built popup/popup.js"));

console.log("Extension build started...");
