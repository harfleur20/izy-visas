import { ReactNode } from "react";

interface NavItemProps {
  icon: string;
  label: string;
  active?: boolean;
  badge?: { text: string; color: "red" | "amber" | "blue" };
  gold?: boolean;
  suffixIcon?: string;
  onClick: () => void;
}

export const NavItem = ({ icon, label, active, badge, gold, suffixIcon, onClick }: NavItemProps) => {
  const activeBase = gold
    ? "bg-gold/15 text-gold-2 border-gold-2/25"
    : "bg-primary/[0.17] text-primary-hover border-primary-hover/20";

  const badgeColors = {
    red: "bg-destructive text-foreground",
    amber: "bg-amber-2 text-foreground",
    blue: "bg-primary-hover text-foreground",
  };

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-[7px] cursor-pointer transition-all text-[0.8rem] text-muted-foreground mb-px border border-transparent whitespace-nowrap relative hover:bg-foreground/[0.04] hover:text-foreground ${active ? activeBase : ""}`}
    >
      {active && (
        <span
          className={`absolute left-0 top-[22%] bottom-[22%] w-0.5 rounded-r ${gold ? "bg-gold-2" : "bg-primary-hover"}`}
        />
      )}
      <span className="text-[0.95rem] flex-shrink-0 w-[17px] text-center">{icon}</span>
      <span className="flex-1">{label}</span>
      {suffixIcon && <span className="text-sm ml-1">{suffixIcon}</span>}
      {badge && (
        <span className={`ml-auto min-w-[17px] h-[17px] rounded-full px-1 flex items-center justify-center font-syne text-[0.58rem] font-extrabold ${badgeColors[badge.color]}`}>
          {badge.text}
        </span>
      )}
    </div>
  );
};

export const NavGroup = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="px-3 pt-2.5 pb-1">
    <div className="font-syne text-[0.57rem] tracking-[0.16em] uppercase text-muted-foreground px-2 mb-0.5">{label}</div>
    {children}
  </div>
);

export default NavItem;
