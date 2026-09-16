import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Deployed at rogersbnys-wq.github.io/swolley-mammoths via GitHub
  // Pages (see .github/workflows/deploy-pages.yml). Netlify or Vercel
  // would need this commented back out, since they serve from a root
  // domain rather than a subpath.
  base: "/swolley-mammoths/",
});
