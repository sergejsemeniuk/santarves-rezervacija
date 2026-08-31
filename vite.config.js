import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Для GitHub Pages base должен быть "/имя-репозитория/".
// Для Netlify (или своего домена) оставь base: "/".
export default defineConfig({
  plugins: [react()],
  base: "/cube-room-booking/",
});
