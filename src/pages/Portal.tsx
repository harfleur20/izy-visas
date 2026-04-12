import { useNavigate } from "react-router-dom";

const Portal = () => {
  const navigate = useNavigate();

  const cards = [
    {
      key: "client",
      icon: "🌍",
      title: "Espace Client",
      desc: "Vous avez reçu un refus de visa. Constituez votre dossier, choisissez votre mode d'envoi et payez en toute sécurité.",
      path: "/client",
      colorClass: "border-primary/25 bg-primary/10 hover:shadow-[0_16px_48px_rgba(26,80,220,0.2)] hover:border-primary-hover/50",
      titleColor: "text-primary-light",
      arrowColor: "text-primary-hover",
    },
    {
      key: "avocat",
      icon: "⚖️",
      title: "Espace Avocat",
      desc: "Relisez et annotez les recours assignés. Gérez votre profil et suivez vos honoraires.",
      path: "/avocat",
      colorClass: "border-gold/22 bg-gold/[0.08] hover:shadow-[0_16px_48px_rgba(192,136,40,0.15)] hover:border-gold-2/45",
      titleColor: "text-gold-2",
      arrowColor: "text-gold-2",
    },
    {
      key: "admin",
      icon: "🛠️",
      title: "Administration",
      desc: "Supervisez tous les dossiers, réassignez les avocats, gérez les alertes et pilotez la plateforme.",
      path: "/admin",
      colorClass: "border-amber/20 bg-amber/[0.08] hover:shadow-[0_16px_48px_rgba(200,120,32,0.15)] hover:border-amber-2/40",
      titleColor: "text-amber-2",
      arrowColor: "text-amber-2",
    },
  ];

  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center px-4 py-6 sm:p-8 overflow-y-auto">
      {/* Background orbs */}
      <div className="absolute w-[700px] h-[700px] -top-[300px] -left-[200px] rounded-full bg-[radial-gradient(circle,rgba(26,80,220,0.1)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute w-[500px] h-[500px] -bottom-[200px] -right-[100px] rounded-full bg-[radial-gradient(circle,rgba(192,136,40,0.08)_0%,transparent_70%)] pointer-events-none" />

      {/* Logo */}
      <div className="font-syne font-extrabold text-[1.8rem] sm:text-[2.4rem] tracking-tight mb-2 relative z-10">
        IZY<em className="not-italic bg-gold-2 text-background px-2 py-0.5 rounded-[5px]">VISA</em>
      </div>

      {/* Tagline */}
      <h1 className="font-fraunces text-[clamp(1.1rem,3vw,2rem)] text-cream text-center mb-2.5 relative z-10 leading-tight">
        Contestez votre refus de visa.<br />Obtenez enfin votre visa.
      </h1>

      {/* Subtitle */}
      <p className="text-muted-foreground text-xs sm:text-sm text-center mb-6 sm:mb-10 max-w-[480px] leading-relaxed relative z-10 px-2">
        Plateforme juridique complète — Recours CRRV · Relecture avocat · Envoi LRAR MySendingBox · Paiement sécurisé Stripe
      </p>

      {/* Portal cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 max-w-[760px] w-full relative z-10">
        {cards.map((card) => (
          <div
            key={card.key}
            onClick={() => navigate(card.path)}
            className={`rounded-[18px] p-5 sm:p-7 border cursor-pointer transition-all duration-250 relative overflow-hidden hover:-translate-y-1 ${card.colorClass}`}
          >
            <div className="text-[1.6rem] sm:text-[2rem] mb-2 sm:mb-3">{card.icon}</div>
            <h3 className={`font-syne font-bold text-base mb-1.5 ${card.titleColor}`}>{card.title}</h3>
            <p className="text-[0.78rem] text-muted-foreground leading-relaxed mb-3 sm:mb-4">{card.desc}</p>
            <div className={`font-syne text-[0.7rem] font-bold tracking-wider uppercase ${card.arrowColor} md:inline-block`}>
              <span className="hidden md:inline">Accéder →</span>
              <button className="md:hidden w-full py-2.5 rounded-lg bg-foreground/[0.06] border border-foreground/10 text-center">
                Accéder →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="relative mt-6 sm:absolute sm:bottom-6 z-10 text-xs text-muted-foreground">
        <a href="/cgu" className="hover:text-foreground transition-colors">
          CGU & Politique de confidentialité
        </a>
        <span className="mx-2">·</span>
        <span>© {new Date().getFullYear()} IZY Visa</span>
      </div>
    </div>
  );
};

export default Portal;
