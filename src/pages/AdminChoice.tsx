import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const AdminChoice = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,112,255,0.12),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(192,136,40,0.1),transparent_35%)] pointer-events-none" />

      <div className="w-full max-w-[520px] relative z-10">
        <div className="text-center mb-6">
          <div className="font-syne font-extrabold text-[2rem] tracking-tight mb-2">
            IZY<em className="not-italic bg-[hsl(var(--gold-2))] text-[hsl(var(--background))] px-2 py-0.5 rounded-[5px]">VISA</em>
          </div>
          <p className="text-muted-foreground text-sm font-syne font-bold">Choisir un espace administrateur</p>
        </div>

        <div className="bg-panel border border-border rounded-xl p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <div className="space-y-3">
            <button
              className="w-full text-left border border-border-2 bg-background-2 hover:bg-primary/[0.08] hover:border-primary-hover/45 rounded-[8px] p-4 transition-all"
              onClick={() => navigate("/super-admin", { replace: true })}
            >
              <div className="font-syne font-extrabold text-base text-foreground mb-1">Super admin</div>
              <div className="text-sm text-muted-foreground">Gérer les administrateurs, les accès et les journaux globaux.</div>
            </button>

            <button
              className="w-full text-left border border-border-2 bg-background-2 hover:bg-primary/[0.08] hover:border-primary-hover/45 rounded-[8px] p-4 transition-all"
              onClick={() => navigate("/admin", { replace: true })}
            >
              <div className="font-syne font-extrabold text-base text-foreground mb-1">Admin opérationnel</div>
              <div className="text-sm text-muted-foreground">Gérer les dossiers, les avocats, les alertes et les assignations.</div>
            </button>
          </div>

          <button
            className="w-full mt-4 font-syne font-bold text-[0.78rem] px-4 py-2 rounded-[7px] bg-foreground/[0.07] text-muted-foreground border border-border-2 hover:bg-foreground/[0.11] transition-all"
            onClick={() => void signOut()}
          >
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminChoice;
