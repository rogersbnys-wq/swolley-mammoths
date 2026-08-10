import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // If deploying to GitHub Pages at username.github.io/swolley-mammoths,
  // uncomment the line below. Netlify and Vercel need it left alone.
  // base: "/swolley-mammoths/",
});
