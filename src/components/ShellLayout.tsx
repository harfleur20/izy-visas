import { ReactNode, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LogOut } from "lucide-react";

interface ShellLayoutProps {
  role: string;
  roleLabel: string;
  sidebar: ReactNode;
  topbarTitle: string;
  topbarRight?: ReactNode;
  footerContent?: ReactNode;
  children: ReactNode;
  bottomNavItems?: { icon: string; label: string; onClick: () => void; active?: boolean }[];
}

const ShellLayout = ({
  role: _role,
  roleLabel,
  sidebar,
  topbarTitle,
  topbarRight,
  footerContent,
  children,
  bottomNavItems,
}: ShellLayoutProps) => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close drawer on outside click
  useEffect(() => {
    if (!drawerOpen) return;
    const handle = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setDrawerOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [drawerOpen]);

  // Close drawer on escape
  useEffect(() => {
    if (!drawerOpen) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [drawerOpen]);

  return (
    <div className="flex h-screen relative">
      {/* Desktop Sidebar */}
      <aside className="w-[240px] flex-shrink-0 bg-background-2 border-r border-border flex-col overflow-y-auto hidden lg:flex">
        <div className="p-4 border-b border-border">
          <div
            className="text-[0.7rem] text-muted-foreground cursor-pointer flex items-center gap-1 hover:text-foreground transition-colors mb-2"
            onClick={() => navigate("/")}
          >
            ← Accueil
          </div>
          <div className="font-syne font-extrabold text-lg tracking-tight flex items-center gap-1">
            IZY<em className="not-italic bg-gold-2 text-background px-1.5 py-0.5 rounded-[3px] text-sm">VISA</em>
          </div>
          <div className="font-syne text-[0.58rem] tracking-[0.14em] uppercase text-muted-foreground flex items-center gap-1.5 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-2" />
            {roleLabel}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sidebar}
        </div>
        {footerContent && (
          <div className="mt-auto p-3 border-t border-border text-[0.67rem] text-muted-foreground leading-relaxed">
            {footerContent}
          </div>
        )}
      </aside>

      {/* Mobile Drawer Overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Overlay */}
          <div className="absolute inset-0 bg-background/70 animate-fadeInOverlay" />
          {/* Drawer */}
          <div
            ref={drawerRef}
            className="absolute left-0 top-0 bottom-0 w-[85%] max-w-[320px] bg-background-2 border-r border-border flex flex-col animate-slideInRight overflow-y-auto"
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="font-syne font-extrabold text-lg tracking-tight flex items-center gap-1">
                  IZY<em className="not-italic bg-gold-2 text-background px-1.5 py-0.5 rounded-[3px] text-sm">VISA</em>
                </div>
                <div className="font-syne text-[0.58rem] tracking-[0.14em] uppercase text-muted-foreground flex items-center gap-1.5 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-2" />
                  {roleLabel}
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="w-8 h-8 rounded-lg bg-foreground/[0.06] flex items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label="Fermer le menu"
              >
                ✕
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto"
              onClick={() => setDrawerOpen(false)}
            >
              {sidebar}
            </div>
            <div className="p-3 border-t border-border">
              <button
                onClick={() => { setDrawerOpen(false); navigate("/"); }}
                className="text-[0.7rem] text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Retour à l'accueil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <div className="h-[54px] bg-background-2 border-b border-border flex items-center justify-between px-3 sm:px-5 flex-shrink-0">
          <div className="flex items-center gap-2">
            {/* Hamburger - mobile only */}
            <button
              className="lg:hidden w-8 h-8 rounded-lg bg-foreground/[0.06] flex items-center justify-center text-foreground"
              onClick={() => setDrawerOpen(true)}
              aria-label="Ouvrir le menu"
            >
              ☰
            </button>
            <div className="font-syne font-bold text-[0.82rem] sm:text-[0.92rem] truncate max-w-[180px] sm:max-w-none">{topbarTitle}</div>
          </div>
          <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
            {topbarRight}
            <button
              onClick={async () => { await signOut(); navigate("/"); }}
              className="w-[30px] h-[30px] rounded-md bg-foreground/[0.06] border border-border-2 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
              title="Se déconnecter"
              aria-label="Se déconnecter"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-y-auto p-3 sm:p-5 ${bottomNavItems ? "pb-20" : ""}`}>
          {children}
        </div>
      </div>

      {/* Bottom Navigation - mobile only */}
      {bottomNavItems && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-background-2 border-t border-border flex items-center justify-around h-[56px] safe-area-bottom">
          {bottomNavItems.map((item, i) => (
            <button
              key={i}
              onClick={item.onClick}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                item.active ? "text-primary-hover" : "text-muted-foreground"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-[0.6rem] font-syne font-bold">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ShellLayout;
