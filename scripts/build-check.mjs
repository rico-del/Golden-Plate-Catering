import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const requiredFiles = [
  "public/index.html",
  "public/styles.css",
  "public/app.js",
  "public/site-config.js",
  "server.mjs"
];
const requiredAssets = [
  "background_video.mp4",
  "dining_display.mp4",
  "table_setting.mp4",
  "breakfast_arrowroots.png",
  "logo.png",
  "buffet_1.png",
  "dining_gazebo_1.png",
  "dining_gazebo_2.png",
  "fried_chips.png",
  "maandazi.png",
  "salad.png",
  "samosas.png",
  "sausages.png",
  "stewed_chicken.png",
  "stir_fried_chicken.png"
];

for (const file of requiredFiles) await fs.access(path.join(root, file));
for (const asset of requiredAssets) await fs.access(path.join(root, "assets", asset));

const app = await fs.readFile(path.join(root, "public/app.js"), "utf8");
const manifest = await fs.readFile(path.join(root, "public/site-config.js"), "utf8");
const forbidden = ["style=", "console.log(", "https://images.", "lorem ipsum"];
for (const value of forbidden) {
  if (app.toLowerCase().includes(value) || manifest.toLowerCase().includes(value)) {
    throw new Error(`Unexpected placeholder or inline pattern found: ${value}`);
  }
}
for (const video of ["background_video.mp4", "dining_display.mp4", "table_setting.mp4"]) {
  if (!manifest.includes(video)) throw new Error(`Video missing from asset manifest: ${video}`);
}

console.log(`Build check passed: ${requiredFiles.length} project files and ${requiredAssets.length} supplied assets verified.`);
