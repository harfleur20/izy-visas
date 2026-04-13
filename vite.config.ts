import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const vendorChunkGroups = [
  {
    name: "react-vendor",
    packages: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
  },
  {
    name: "supabase-vendor",
    packages: [
      "@lovable.dev/cloud-auth-js",
      "@supabase/auth-js",
      "@supabase/functions-js",
      "@supabase/postgrest-js",
      "@supabase/realtime-js",
      "@supabase/storage-js",
      "@supabase/supabase-js",
    ],
  },
  {
    name: "ui-vendor",
    packages: ["@radix-ui", "cmdk", "input-otp", "next-themes", "sonner", "vaul"],
  },
  {
    name: "forms-vendor",
    packages: ["@hookform/resolvers", "react-hook-form", "zod"],
  },
  {
    name: "charts-vendor",
    packages: ["react-resizable-panels", "recharts"],
  },
  {
    name: "date-vendor",
    packages: ["date-fns", "react-day-picker"],
  },
  {
    name: "icons-vendor",
    packages: ["lucide-react"],
  },
  {
    name: "utils-vendor",
    packages: ["class-variance-authority", "clsx", "embla-carousel-react", "tailwind-merge"],
  },
];

const packagePath = (packageName: string) => `/node_modules/${packageName}/`;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
}));
