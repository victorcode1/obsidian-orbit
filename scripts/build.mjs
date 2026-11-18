import { copyFile, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const colors = JSON.parse(
  await readFile(new URL("src/colors.json", root), "utf8"),
);
const css = await readFile(new URL("src/theme.css", root), "utf8");
const scene = new URL("src/scene.html", root);
const sceneDestination = new URL("obsidian-orbit.html", root);
// T3 Code ignores a theme scene larger than 4 MiB.
const sceneBytes = (await stat(scene)).size;
if (sceneBytes > 4 * 1024 * 1024) {
  throw new Error(`Scene is ${sceneBytes} bytes; T3 allows 4 MiB.`);
}
const theme = {
  version: 1,
  id: "obsidian-orbit",
  name: "Obsidian Orbit",
  appearance: "dark",
  canvas: colors.canvas,
  accent: colors.accent,
  colors,
  css,
};

for (const [role, color] of Object.entries(colors)) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    throw new Error(`Invalid color for ${role}: ${color}`);
  }
}

// T3 Code drops remote files, and installed builds cap theme CSS at 50,000 chars.
if (/@import|image-set\(|url\(/i.test(css)) {
  throw new Error("The skin must stay self-contained.");
}
if (css.length > 50_000) {
  throw new Error(
    `Theme CSS is ${css.length} characters; T3 Code Beta allows 50000.`,
  );
}
console.log(`css: ${css.length} / 50000 characters`);

const luminance = (hex) => {
  const rgb = hex.match(/[0-9a-f]{2}/gi).map((value) => {
    const component = Number.parseInt(value, 16) / 255;
    return component <= 0.04045
      ? component / 12.92
      : ((component + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};

for (const [foreground, background] of [
  ["text", "canvas"],
  ["textMuted", "surface"],
  ["accentForeground", "accent"],
  ["messageForeground", "messageSurface"],
  ["codeForeground", "codeBackground"],
  ["sidebarMutedForeground", "sidebar"],
  ["terminalForeground", "terminalBackground"],
]) {
  const levels = [
    luminance(colors[foreground]),
    luminance(colors[background]),
  ].sort((a, b) => b - a);
  const contrast = (levels[0] + 0.05) / (levels[1] + 0.05);
  if (contrast < 4.5) {
    throw new Error(
      `${foreground}/${background} contrast is ${contrast.toFixed(2)}; expected >= 4.5.`,
    );
  }
  console.log(`${foreground}/${background}: ${contrast.toFixed(2)}:1`);
}

const output = `${JSON.stringify(theme, null, 2)}\n`;
const destination = new URL("obsidian-orbit.json", root);
if (process.argv.includes("--check")) {
  const sceneCurrent = await readFile(sceneDestination).catch(() => null);
  if (
    (await readFile(destination, "utf8")) !== output ||
    !sceneCurrent?.equals(await readFile(scene))
  ) {
    throw new Error("Generated skin is out of date. Run npm run build.");
  }
  console.log("Skin is valid and matches its source.");
} else {
  await writeFile(destination, output);
  await copyFile(scene, sceneDestination);
  console.log(
    `Built ${fileURLToPath(destination)} (${Buffer.byteLength(output)} bytes) and ${fileURLToPath(sceneDestination)} (${sceneBytes} bytes).`,
  );
}
