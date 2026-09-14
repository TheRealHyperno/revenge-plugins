import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { createHash } from "crypto";
import { rollup } from "rollup";
import esbuild from "rollup-plugin-esbuild";
import { nodeResolve } from "@rollup/plugin-node-resolve";

for (const name of await readdir("./plugins")) {
  const manifest = JSON.parse(await readFile(`./plugins/${name}/manifest.json`, "utf8"));
  const outDir = `./dist/${name}`;
  await mkdir(outDir, { recursive: true });
  const bundle = await rollup({
    input: `./plugins/${name}/${manifest.main}`,
    onwarn: () => {},
    plugins: [nodeResolve(), esbuild({ minify: true, target: "es2020", jsx: "transform", jsxFactory: "React.createElement", jsxFragment: "React.Fragment" })],
  });
  await bundle.write({
    file: `${outDir}/index.js`,
    format: "iife",
    compact: true,
    exports: "named",
    globals(id) {
      if (id.startsWith("@vendetta")) return id.substring(1).replace(/\//g, ".");
      return { react: "window.React" }[id] ?? null;
    },
  });
  await bundle.close();
  const js = await readFile(`${outDir}/index.js`);
  manifest.hash = createHash("sha256").update(js).digest("hex");
  manifest.main = "index.js";
  await writeFile(`${outDir}/manifest.json`, JSON.stringify(manifest));
  console.log(`built ${name}`);
}
