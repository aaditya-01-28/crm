import fs from "fs";
import path from "path";

const targetFile = path.join(
  process.cwd(),
  "node_modules",
  "@opennextjs",
  "cloudflare",
  "dist",
  "cli",
  "build",
  "patches",
  "plugins",
  "load-manifest.js"
);

if (fs.existsSync(targetFile)) {
  let content = fs.readFileSync(targetFile, "utf-8");
  let modified = false;

  // 1. Ensure preview-props is included in glob pattern
  const oldGlob = "**/{*-manifest,required-server-files,prefetch-hints}.json";
  const newGlob = "**/{*-manifest,required-server-files,prefetch-hints,preview-props}.json";
  if (content.includes(oldGlob)) {
    content = content.replace(oldGlob, newGlob);
    modified = true;
  }

  // 2. Ensure loadManifest does not crash worker if an unmapped manifest is requested
  const oldThrow = "throw new Error(`Unexpected loadManifest(${path2}) call!`);";
  const newThrow = "console.warn(`[OpenNext] Missing optional manifest: ${$PATH}`); return {};";
  if (content.includes("throw new Error(`Unexpected loadManifest(${$PATH}) call!`);")) {
    content = content.replace(
      "throw new Error(`Unexpected loadManifest(${$PATH}) call!`);",
      "console.warn(`[OpenNext] Missing optional manifest: ${$PATH}`); return {};"
    );
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(targetFile, content, "utf-8");
    console.log("✅ Successfully patched @opennextjs/cloudflare load-manifest plugin");
  } else {
    console.log("ℹ️ @opennextjs/cloudflare load-manifest plugin already patched");
  }
}
