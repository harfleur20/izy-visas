import { useEffect, useMemo, useState } from "react";
import { UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type TopbarProfileBadgeProps = {
  name?: string | null;
  fallback?: string;
  className?: string;
};

const firstToken = (value?: string | null) => value?.trim().split(/\s+/)[0] || "";

export const TopbarProfileBadge = ({ name, fallback = "Utilisateur", className }: TopbarProfileBadgeProps) => {
  const { user } = useAuth();
  const [profileFirstName, setProfileFirstName] = useState("");

  useEffect(() => {
    if (firstToken(name) || !user?.id) return;

    let cancelled = false;
    const loadProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name")
        .eq("id", user.id)
        .maybeSingle();

      if (!cancelled) {
        setProfileFirstName(data?.first_name || "");
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [name, user?.id]);

  const userMetadataFirstName = typeof user?.user_metadata?.first_name === "string"
    ? user.user_metadata.first_name
    : "";

  const label = useMemo(
    () =>
      firstToken(name) ||
      firstToken(profileFirstName) ||
      firstToken(userMetadataFirstName) ||
      firstToken(user?.email?.split("@")[0]) ||
      fallback,
    [fallback, name, profileFirstName, user?.email, userMetadataFirstName],
  );

  return (
    <div
      className={cn(
        "h-[30px] max-w-[145px] rounded-md bg-foreground/[0.06] border border-border-2 px-2.5 flex items-center gap-1.5 text-foreground",
        className,
      )}
    >
      <UserRound size={14} className="text-muted-foreground flex-shrink-0" />
      <span className="font-syne font-bold text-[0.72rem] truncate">{label}</span>
    </div>
  );
};

export default TopbarProfileBadge;
