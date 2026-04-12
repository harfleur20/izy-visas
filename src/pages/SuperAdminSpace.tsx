import { useState, useEffect } from "react";
import ShellLayout from "@/components/ShellLayout";
import { NavItem, NavGroup } from "@/components/NavItem";
import { Eyebrow, BigTitle, Box } from "@/components/ui-custom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { roleLabel } from "@/lib/roles";

type UserRoleRow = Database["public"]["Tables"]["user_roles"]["Row"];
type AuditLogRow = Database["public"]["Tables"]["audit_admin"]["Row"];
type InvitationRow = Database["public"]["Tables"]["admin_invitations"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type AdminListItem = UserRoleRow & { profile?: Pick<ProfileRow, "id" | "first_name" | "last_name" | "phone"> };

const SuperAdminSpace = () => {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [admins, setAdmins] = useState<AdminListItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastActivationUrl, setLastActivationUrl] = useState("");

  // Form state for new admin
  const [form, setForm] = useState({
    email: "", nom: "", prenom: "", role: "admin_delegue",
    motif: "", perimetre: "", date_debut: "", date_fin: "",
  });

  const fetchAdmins = async () => {
    const { data } = await supabase
      .from("user_roles")
      .select("id, user_id, role")
      .in("role", ["admin_delegue", "admin_juridique", "super_admin"]);
    if (data) {
      // Fetch profiles for these users
      const userIds = data.map(d => d.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, phone")
        .in("id", userIds);
      const merged: AdminListItem[] = data.map(r => ({
        id: r.id,
        user_id: r.user_id,
        role: r.role,
        profile: profiles?.find(p => p.id === r.user_id),
      }));
      setAdmins(merged);
    }
  };

  const fetchAudit = async () => {
    const { data } = await supabase
      .from("audit_admin")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setAuditLogs(data);
  };

  const fetchInvitations = async () => {
    const { data } = await supabase
      .from("admin_invitations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setInvitations(data);
  };

  useEffect(() => {
    void fetchAdmins();
    void fetchAudit();
    void fetchInvitations();
  }, []);

  const buildActivationUrl = (token: string) => `${window.location.origin}/activate-admin?token=${encodeURIComponent(token)}`;

  const copyActivationLink = async (token: string) => {
    const activationUrl = buildActivationUrl(token);
    try {
      await navigator.clipboard.writeText(activationUrl);
      toast.success("Lien d’activation copié");
    } catch {
      toast.error("Impossible de copier le lien");
    }
  };

  const handleInviteAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-admin", {
        body: form,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setLastActivationUrl(data.activation_url || "");
      toast.success(data.message || "Invitation créée");
      setForm({ email: "", nom: "", prenom: "", role: "admin_delegue", motif: "", perimetre: "", date_debut: "", date_fin: "" });
      void fetchInvitations();
      void fetchAudit();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'invitation");
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (targetUserId: string) => {
    if (!confirm("Révoquer cet administrateur ? Cette action est irréversible.")) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("revoke-admin", {
        body: { target_user_id: targetUserId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data.message || "Admin révoqué");
      void fetchAdmins();
      void fetchInvitations();
      void fetchAudit();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la révocation");
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!confirm("Révoquer cette invitation en attente ?")) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("revoke-admin", {
        body: { invitation_id: invitationId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data.message || "Invitation révoquée");
      void fetchInvitations();
      void fetchAudit();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la révocation");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none transition-all focus:border-primary-hover/55";
  const labelClass = "font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block";
  const btnPrimary = "font-syne font-bold text-[0.78rem] px-5 py-3 rounded-[9px] bg-primary-hover text-foreground hover:bg-[#5585ff] transition-all disabled:opacity-50";

  const sidebar = (
    <>
      <NavGroup label="Super Admin">
        <NavItem icon="🏠" label="Vue générale" active={page === 0} onClick={() => setPage(0)} />
      </NavGroup>
      <NavGroup label="Accès">
        <NavItem icon="👥" label="Gestion des accès" active={page === 1} onClick={() => setPage(1)} />
        <NavItem icon="📨" label="Invitations" active={page === 2} onClick={() => setPage(2)} />
      </NavGroup>
      <NavGroup label="Sécurité">
        <NavItem icon="📋" label="Journal d'audit" active={page === 3} onClick={() => setPage(3)} />
      </NavGroup>
    </>
  );

  return (
    <ShellLayout
      role="admin"
      roleLabel="Super Administration"
      sidebar={sidebar}
      topbarTitle={["Vue générale", "Gestion des accès", "Invitations", "Journal d'audit"][page]}
      topbarRight={<div className="w-[30px] h-[30px] rounded-md bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center font-syne font-extrabold text-[0.68rem] text-white">SA</div>}
      footerContent={<><strong className="text-muted-foreground">Super Admin IZY</strong></>}
    >
      <div className="animate-fadeU">

        {/* Page 0 — Overview */}
        {page === 0 && (
          <div>
            <Eyebrow>Super Administration</Eyebrow>
            <BigTitle>Tableau de bord</BigTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { val: String(admins.length), label: "Administrateurs", color: "text-primary-hover" },
                { val: String(invitations.filter(i => !i.used_at && !i.revoked).length), label: "Invitations en attente", color: "text-amber-2" },
                { val: String(auditLogs.length), label: "Actions journalisées", color: "text-green-2" },
                { val: "🔒", label: "2FA obligatoire", color: "text-green-2" },
              ].map((k) => (
                <div key={k.label} className="bg-panel border border-border rounded-[10px] p-4">
                  <div className={`font-syne font-extrabold text-2xl mb-1 ${k.color}`}>{k.val}</div>
                  <div className="text-[0.7rem] text-muted-foreground">{k.label}</div>
                </div>
              ))}
            </div>
            <Box variant="info" title="Sécurité">
              Seul le super administrateur peut créer, modifier ou révoquer des comptes administrateurs. Toutes les actions sont journalisées.
            </Box>
            {lastActivationUrl && (
              <div className="mt-4 bg-panel border border-border rounded-xl p-4">
                <div className="font-syne font-bold text-sm mb-2">Dernier lien d’activation</div>
                <div className="text-xs text-muted-foreground break-all mb-3">{lastActivationUrl}</div>
                <button
                  onClick={() => navigator.clipboard.writeText(lastActivationUrl).then(() => toast.success("Lien copié")).catch(() => toast.error("Impossible de copier le lien"))}
                  className={btnPrimary}
                  type="button"
                >
                  Copier le lien
                </button>
              </div>
            )}
          </div>
        )}

        {/* Page 1 — Access Management */}
        {page === 1 && (
          <div>
            <Eyebrow>Accès</Eyebrow>
            <BigTitle>Gestion des accès administrateurs</BigTitle>

            {/* Create admin form */}
            <div className="bg-panel border border-border rounded-xl p-5 mb-5">
              <h3 className="font-syne font-bold text-sm mb-4">Créer un administrateur</h3>
              <form onSubmit={handleInviteAdmin} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Prénom</label>
                    <input className={inputClass} value={form.prenom} onChange={e => setForm(p => ({ ...p, prenom: e.target.value }))} required />
                  </div>
                  <div>
                    <label className={labelClass}>Nom</label>
                    <input className={inputClass} value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} required />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Email professionnel</label>
                  <input type="email" className={inputClass} value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
                </div>
                <div>
                  <label className={labelClass}>Rôle</label>
                  <select className={inputClass} value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                    <option value="admin_delegue">Admin délégué — Gestion dossiers, avocats, alertes</option>
                    <option value="admin_juridique">Admin juridique — Base juridique uniquement</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Motif de la délégation</label>
                  <input className={inputClass} value={form.motif} onChange={e => setForm(p => ({ ...p, motif: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Périmètre d'accès</label>
                  <input className={inputClass} value={form.perimetre} onChange={e => setForm(p => ({ ...p, perimetre: e.target.value }))} placeholder="Ex: Dossiers visa étudiant uniquement" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Date de début</label>
                    <input type="date" className={inputClass} value={form.date_debut} onChange={e => setForm(p => ({ ...p, date_debut: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelClass}>Date de fin</label>
                    <input type="date" className={inputClass} value={form.date_fin} onChange={e => setForm(p => ({ ...p, date_fin: e.target.value }))} />
                  </div>
                </div>
                <button type="submit" disabled={loading} className={btnPrimary}>
                  {loading ? "Création…" : "Créer l'invitation"}
                </button>
              </form>
            </div>

            {/* Existing admins */}
            <div className="bg-panel border border-border rounded-xl overflow-hidden">
              <div className="p-3 border-b border-border">
                <h3 className="font-syne font-bold text-sm">Administrateurs actifs</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {["Nom", "Rôle", "Actions"].map(h => (
                        <th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {admins.map((a) => (
                      <tr key={a.user_id} className="hover:bg-foreground/[0.022]">
                        <td className="px-3.5 py-2.5 text-xs border-b border-foreground/[0.03]">
                          {a.profile?.first_name || ""} {a.profile?.last_name || ""} 
                        </td>
                        <td className="px-3.5 py-2.5 text-xs border-b border-foreground/[0.03]">
                          <span className={`font-syne font-bold text-[0.65rem] px-2 py-0.5 rounded-full ${
                            a.role === "super_admin" ? "bg-amber-500/20 text-amber-400" :
                            a.role === "admin_delegue" ? "bg-primary/20 text-primary-hover" :
                            "bg-purple-500/20 text-purple-400"
                          }`}>
                            {roleLabel(a.role)}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-xs border-b border-foreground/[0.03]">
                          {a.role !== "super_admin" && (
                            <button
                              onClick={() => handleRevoke(a.user_id)}
                              disabled={loading}
                              className="font-syne font-bold text-[0.65rem] px-3 py-1 rounded-md bg-destructive/[0.14] text-red-2 border border-destructive/25 hover:bg-destructive/25 transition-all"
                            >
                              Révoquer
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Page 2 — Invitations */}
        {page === 2 && (
          <div>
            <Eyebrow>Invitations</Eyebrow>
            <BigTitle>Historique des invitations</BigTitle>
            <div className="bg-panel border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {["Email", "Rôle", "Date", "Statut", "Actions"].map(h => (
                        <th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((inv) => (
                      <tr key={inv.id} className="hover:bg-foreground/[0.022]">
                        <td className="px-3.5 py-2.5 text-xs border-b border-foreground/[0.03]">{inv.email}</td>
                        <td className="px-3.5 py-2.5 text-xs border-b border-foreground/[0.03]">{roleLabel(inv.role)}</td>
                        <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">
                          {new Date(inv.created_at).toLocaleDateString("fr-FR")}
                        </td>
                        <td className="px-3.5 py-2.5 text-xs border-b border-foreground/[0.03]">
                          {inv.revoked ? (
                            <span className="text-red-2 font-bold">Révoquée</span>
                          ) : inv.used_at ? (
                            <span className="text-green-2 font-bold">Utilisée</span>
                          ) : new Date(inv.expires_at) < new Date() ? (
                            <span className="text-muted-foreground">Expirée</span>
                          ) : (
                            <span className="text-amber-400 font-bold">En attente</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-xs border-b border-foreground/[0.03]">
                          {!inv.revoked && !inv.used_at && new Date(inv.expires_at) >= new Date() && (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => copyActivationLink(inv.token)}
                                className="font-syne font-bold text-[0.65rem] px-3 py-1 rounded-md bg-primary/15 text-primary-hover border border-primary/20 hover:bg-primary/25 transition-all"
                              >
                                Copier le lien
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRevokeInvitation(inv.id)}
                                disabled={loading}
                                className="font-syne font-bold text-[0.65rem] px-3 py-1 rounded-md bg-destructive/[0.14] text-red-2 border border-destructive/25 hover:bg-destructive/25 transition-all"
                              >
                                Révoquer
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Page 3 — Audit */}
        {page === 3 && (
          <div>
            <Eyebrow>Sécurité</Eyebrow>
            <BigTitle>Journal d'audit</BigTitle>
            <Box variant="info" title="Lecture seule">Ce journal est immuable. Aucune entrée ne peut être modifiée ou supprimée.</Box>
            <div className="bg-panel border border-border rounded-xl overflow-hidden mt-3">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {["Date", "Action", "Admin", "Rôle", "Cible", "IP"].map(h => (
                        <th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-foreground/[0.022]">
                        <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">
                          {new Date(log.created_at).toLocaleString("fr-FR")}
                        </td>
                        <td className="px-3.5 py-2.5 text-xs font-semibold border-b border-foreground/[0.03]">{log.action_type}</td>
                        <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{log.admin_id?.slice(0, 8)}…</td>
                        <td className="px-3.5 py-2.5 text-xs border-b border-foreground/[0.03]">{log.admin_role}</td>
                        <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{log.cible_type} {log.cible_id?.slice(0, 8)}</td>
                        <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{log.adresse_ip}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </ShellLayout>
  );
};

export default SuperAdminSpace;
