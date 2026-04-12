import { AlertCircle, CheckCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusAlertProps {
  variant: "info" | "success" | "warning" | "error";
  title: string;
  children: React.ReactNode;
  className?: string;
}

const variantStyles = {
  info: {
    container: "border-accent/30 bg-accent/5",
    icon: "text-accent",
    title: "text-accent",
    Icon: Info,
  },
  success: {
    container: "border-success/30 bg-success/5",
    icon: "text-success",
    title: "text-success",
    Icon: CheckCircle,
  },
  warning: {
    container: "border-warning/30 bg-warning/5",
    icon: "text-warning",
    title: "text-warning",
    Icon: AlertTriangle,
  },
  error: {
    container: "border-destructive/30 bg-destructive/5",
    icon: "text-destructive",
    title: "text-destructive",
    Icon: AlertCircle,
  },
};

export function StatusAlert({ variant, title, children, className }: StatusAlertProps) {
  const styles = variantStyles[variant];
  const IconComp = styles.Icon;

  return (
    <div className={cn("flex gap-3 rounded-lg border p-4", styles.container, className)}>
      <IconComp className={cn("h-5 w-5 mt-0.5 shrink-0", styles.icon)} />
      <div className="space-y-1">
        <p className={cn("text-sm font-semibold", styles.title)}>{title}</p>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}
