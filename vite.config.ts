import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// GitHub Pages serves a project site (not a custom domain or a user/org
// page) from /<repo-name>/, so the demo/docs build needs that as its base
// path. Local dev and `vite preview` stay at "/".
export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/spread-sheets/" : "/",
  plugins: [react()],
});
