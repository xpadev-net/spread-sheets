import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/lib/index.ts"],
  format: ["esm"],
  dts: true,
  platform: "browser",
});
