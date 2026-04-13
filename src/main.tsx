import { createRoot } from "react-dom/client";
import "./index.css";

const requiredEnvironment = [
  ["VITE_SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL],
  ["VITE_SUPABASE_PUBLISHABLE_KEY", import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY],
] as const;

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

const root = createRoot(rootElement);

function ConfigurationError({ missingKeys }: { missingKeys: string[] }) {
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <section className="max-w-[560px] border border-border rounded-lg p-6 bg-card">
        <p className="font-syne text-sm uppercase text-gold-2 mb-3">Configuration Netlify</p>
        <h1 className="font-syne text-2xl font-bold mb-3">Variables manquantes</h1>
        <p className="text-muted-foreground mb-4">
          L'application ne peut pas demarrer parce que Supabase n'est pas configure dans l'environnement de build.
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          {missingKeys.map((key) => (
            <li key={key}>
              <code>{key}</code>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function ApplicationError() {
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <section className="max-w-[560px] border border-border rounded-lg p-6 bg-card">
        <p className="font-syne text-sm uppercase text-gold-2 mb-3">Chargement</p>
        <h1 className="font-syne text-2xl font-bold mb-3">Impossible de charger l'application</h1>
        <p className="text-muted-foreground">
          Rechargez la page. Si le probleme persiste, ouvrez la console du navigateur pour lire l'erreur JavaScript.
        </p>
      </section>
    </main>
  );
}

const missingEnvironment = requiredEnvironment
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingEnvironment.length > 0) {
  root.render(<ConfigurationError missingKeys={missingEnvironment} />);
} else {
  void import("./App.tsx")
    .then(({ default: App }) => {
      root.render(<App />);
    })
    .catch((error) => {
      console.error("Application failed to load", error);
      root.render(<ApplicationError />);
    });
}
