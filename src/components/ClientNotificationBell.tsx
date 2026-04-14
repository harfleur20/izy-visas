import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

const typeStyles: Record<string, { dot: string; label: string }> = {
  alerte: { dot: "bg-destructive", label: "Alerte" },
  alert: { dot: "bg-destructive", label: "Alerte" },
  dossier: { dot: "bg-primary-hover", label: "Dossier" },
  paiement: { dot: "bg-green-2", label: "Paiement" },
  lrar: { dot: "bg-gold-2", label: "LRAR" },
  info: { dot: "bg-muted-foreground", label: "Info" },
};

const formatNotificationDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const ClientNotificationBell = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.lu).length,
    [notifications],
  );

  const loadNotifications = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("id, user_id, titre, message, type, lu, lien, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      console.error("Notifications load error:", error);
      setLoading(false);
      return;
    }

    setNotifications((data || []) as NotificationRow[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`client-notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void loadNotifications();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadNotifications, user?.id]);

  const markAsRead = async (notificationId: string) => {
    if (!user?.id) return;

    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId ? { ...notification, lu: true } : notification,
      ),
    );

    const { error } = await supabase
      .from("notifications")
      .update({ lu: true })
      .eq("id", notificationId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Notification update error:", error);
      void loadNotifications();
    }
  };

  const markAllAsRead = async () => {
    if (!user?.id || unreadCount === 0 || updating) return;

    setUpdating(true);
    setNotifications((current) => current.map((notification) => ({ ...notification, lu: true })));

    const { error } = await supabase
      .from("notifications")
      .update({ lu: true })
      .eq("user_id", user.id)
      .eq("lu", false);

    if (error) {
      console.error("Notifications bulk update error:", error);
      void loadNotifications();
    }
    setUpdating(false);
  };

  const handleNotificationClick = async (notification: NotificationRow) => {
    if (!notification.lu) {
      await markAsRead(notification.id);
    }

    if (!notification.lien) return;

    setOpen(false);
    if (notification.lien.startsWith("/")) {
      navigate(notification.lien);
      return;
    }

    window.location.href = notification.lien;
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) void loadNotifications();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative w-[30px] h-[30px] rounded-md bg-foreground/[0.06] border border-border-2 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.09] transition-all"
          aria-label={unreadCount > 0 ? `${unreadCount} alerte(s) non lue(s)` : "Notifications"}
          title="Notifications"
        >
          <Bell size={14} />
          {unreadCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 min-w-[17px] h-[17px] rounded-full bg-destructive text-[0.58rem] font-syne font-extrabold text-foreground flex items-center justify-center px-1 border border-background-2">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(360px,calc(100vw-24px))] p-0 rounded-md border-border-2 bg-background-2">
        <div className="p-3 border-b border-border flex items-center justify-between gap-3">
          <div>
            <div className="font-syne font-extrabold text-sm">Alertes</div>
            <div className="text-[0.68rem] text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} non lue(s)` : "Aucune alerte non lue"}
            </div>
          </div>
          <button
            type="button"
            onClick={markAllAsRead}
            disabled={unreadCount === 0 || updating}
            className="h-8 px-2.5 rounded-md border border-border-2 bg-foreground/[0.04] text-[0.68rem] font-syne font-bold text-muted-foreground hover:text-foreground hover:bg-foreground/[0.07] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {updating ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={12} />}
            Tout lu
          </button>
        </div>

        <ScrollArea className="max-h-[390px]">
          {loading && notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              Chargement des alertes
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-6 text-center">
              <div className="font-syne font-bold text-sm">Aucune alerte</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Les rappels importants de votre dossier apparaîtront ici.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notification) => {
                const normalizedType = (notification.type || "info").toLowerCase();
                const style = typeStyles[normalizedType] || typeStyles.info;

                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => {
                      void handleNotificationClick(notification);
                    }}
                    className={cn(
                      "w-full text-left p-3 transition-colors hover:bg-foreground/[0.04]",
                      !notification.lu && "bg-primary/[0.07]",
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className={cn("mt-1.5 w-2 h-2 rounded-full flex-shrink-0", style.dot)} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-syne font-bold text-[0.76rem] text-foreground truncate">
                            {notification.titre}
                          </span>
                          <span className="text-[0.62rem] text-muted-foreground flex-shrink-0">
                            {formatNotificationDate(notification.created_at)}
                          </span>
                        </span>
                        <span className="mt-1 block text-[0.72rem] leading-relaxed text-muted-foreground">
                          {notification.message}
                        </span>
                        <span className="mt-2 inline-flex items-center h-5 px-2 rounded-full border border-border-2 text-[0.58rem] font-syne font-bold uppercase tracking-[0.08em] text-muted-foreground">
                          {style.label}
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default ClientNotificationBell;
