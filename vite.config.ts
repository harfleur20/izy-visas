import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

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
  define: {
    // Fallback for publish builds where .env is not available.
    // These are PUBLIC keys (anon key + project URL), safe to embed.
    ...(mode === "production" && !process.env.VITE_SUPABASE_URL
      ? {
          "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://ormvdwjcanakbyhqjasz.supabase.co"),
          "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybXZkd2pjYW5ha2J5aHFqYXN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1ODM5NTAsImV4cCI6MjA5MTE1OTk1MH0._ifuaMNIkdyKw1MXcFhBVN5kVcRbby9p66EljExvLB4"),
          "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify("ormvdwjcanakbyhqjasz"),
        }
      : {}),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
}));
