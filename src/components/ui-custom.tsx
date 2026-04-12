interface EyebrowProps {
  children: React.ReactNode;
}

export const Eyebrow = ({ children }: EyebrowProps) => (
  <div className="font-syne text-[0.6rem] tracking-[0.18em] uppercase text-gold flex items-center gap-2 mb-2">
    {children}
    <span className="flex-1 h-px bg-gold/15" />
  </div>
);

export const BigTitle = ({ children }: { children: React.ReactNode }) => (
  <h1 className="font-fraunces text-[clamp(1.4rem,2.5vw,1.9rem)] text-cream leading-tight mb-2">{children}</h1>
);

export const Desc = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[0.85rem] text-muted-foreground max-w-[580px] leading-relaxed mb-6">{children}</p>
);

interface BoxProps {
  variant: "alert" | "info" | "warn" | "ok" | "post";
  title: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

const boxStyles = {
  alert: "bg-destructive/[0.09] border-destructive/[0.28]",
  info: "bg-primary/[0.09] border-primary-hover/[0.22]",
  warn: "bg-gold/[0.09] border-gold-2/25",
  ok: "bg-green/[0.09] border-green-2/25",
  post: "bg-post-dark/[0.12] border-post-dark/35",
};

const titleStyles = {
  alert: "text-red-400",
  info: "text-blue-300",
  warn: "text-gold-2",
  ok: "text-green-2",
  post: "text-blue-300",
};

const bodyStyles = {
  alert: "text-red-300",
  info: "text-blue-300/80",
  warn: "text-gold",
  ok: "text-emerald-300",
  post: "text-blue-400/70",
};

export const Box = ({ variant, title, children, className = "", action }: BoxProps) => (
  <div className={`rounded-[11px] p-4 mb-4 border ${boxStyles[variant]} ${className} ${action ? "flex gap-3 items-start" : ""}`}>
    <div className={action ? "flex-1" : ""}>
      <h4 className={`font-syne text-[0.83rem] font-bold mb-1 ${titleStyles[variant]}`}>{title}</h4>
      <p className={`text-[0.8rem] leading-relaxed ${bodyStyles[variant]}`}>{children}</p>
    </div>
    {action}
  </div>
);

export const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="font-syne text-[0.62rem] tracking-[0.16em] uppercase text-gold mb-3 flex items-center gap-2">
    {children}
    <span className="flex-1 h-px bg-gold/[0.14]" />
  </div>
);

interface PillProps {
  variant: "new" | "warn" | "ok" | "red" | "muted" | "post";
  children: React.ReactNode;
}

const pillStyles = {
  new: "bg-primary-hover/[0.14] text-primary-light border-primary-hover/[0.22]",
  warn: "bg-gold-2/[0.12] text-gold-2 border-gold-2/[0.22]",
  ok: "bg-green/[0.12] text-green-2 border-green/[0.22]",
  red: "bg-destructive/[0.14] text-red-2 border-destructive/25 animate-pulse-soft",
  muted: "bg-foreground/[0.06] text-muted-foreground border-border-2",
  post: "bg-post-dark/20 text-blue-300 border-post-dark/35",
};

export const Pill = ({ variant, children }: PillProps) => (
  <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-syne text-[0.6rem] font-bold tracking-wide whitespace-nowrap border ${pillStyles[variant]}`}>
    {children}
  </span>
);
