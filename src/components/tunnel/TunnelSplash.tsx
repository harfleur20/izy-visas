import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface TunnelSplashProps {
  onNext: () => void;
  onLogin: () => void;
}

export default function TunnelSplash({ onNext, onLogin }: TunnelSplashProps) {
  const [showWelcome, setShowWelcome] = useState(false);
  const [showTagline, setShowTagline] = useState(false);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowWelcome(true), 300);
    const t2 = setTimeout(() => setShowTagline(true), 1400);
    const t3 = setTimeout(() => setShowButton(true), 2400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center px-6 overflow-hidden">
      {/* Background orbs */}
      <div className="absolute w-[700px] h-[700px] -top-[300px] -left-[200px] rounded-full bg-[radial-gradient(circle,rgba(26,80,220,0.12)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute w-[500px] h-[500px] -bottom-[200px] -right-[100px] rounded-full bg-[radial-gradient(circle,rgba(192,136,40,0.08)_0%,transparent_70%)] pointer-events-none" />

      {/* Logo */}
      <div
        className={`font-syne font-extrabold text-[2rem] sm:text-[3rem] tracking-tight mb-6 transition-all duration-700 ${
          showWelcome ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        IZY<em className="not-italic bg-gold-2 text-background px-2.5 py-1 rounded-[6px] text-[1.4rem] sm:text-[2rem]">VISA</em>
      </div>

      {/* Welcome text */}
      <h1
        className={`font-fraunces text-[clamp(1.3rem,4vw,2.4rem)] text-cream text-center leading-tight mb-3 transition-all duration-700 ${
          showWelcome ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        Bienvenue sur IZY
      </h1>

      {/* Tagline */}
      <p
        className={`font-dm text-[clamp(1rem,2.5vw,1.4rem)] text-muted-foreground text-center max-w-[500px] leading-relaxed mb-10 transition-all duration-700 delay-100 ${
          showTagline ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        Contestez votre refus de visa en <span className="text-gold-2 font-semibold">5 minutes</span>
      </p>

      {/* CTA */}
      <div
        className={`transition-all duration-500 ${
          showButton ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <Button
          onClick={onNext}
          size="lg"
          className="h-14 px-10 text-base font-syne font-bold rounded-2xl gap-2 bg-primary hover:bg-primary-hover"
        >
          Commencer
          <ArrowRight className="w-5 h-5" />
        </Button>

        <button
          onClick={onLogin}
          className={`mt-4 text-sm text-muted-foreground hover:text-foreground font-syne transition-all duration-500 ${
            showButton ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          Déjà un compte ? <span className="text-primary-hover font-bold">Se connecter</span>
        </button>
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 text-xs text-muted-foreground">
        <a href="/cgu" className="hover:text-foreground transition-colors">
          CGU & Politique de confidentialité
        </a>
        <span className="mx-2">·</span>
        <span>© {new Date().getFullYear()} IZY Visa</span>
      </div>
    </div>
  );
}
