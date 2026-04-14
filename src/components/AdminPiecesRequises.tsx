import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { Eyebrow, BigTitle } from "@/components/ui-custom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const VISA_TYPES = [
  { value: "tous", label: "Tous les types" },
  { value: "court_sejour", label: "Court séjour Schengen" },
  { value: "etudiant", label: "Étudiant (VLS-TS)" },
  { value: "conjoint_francais", label: "Conjoint de Français" },
  { value: "salarie", label: "Salarié / Travail" },
  { value: "passeport_talent", label: "Passeport Talent" },
  { value: "visiteur", label: "Visiteur / Parent enfant FR" },
  { value: "parent_enfant_francais", label: "Parent d'enfant français" },
];

const VISA_LABELS: Record<string, string> = Object.fromEntries(
  VISA_TYPES.map((v) => [v.value, v.label])
);

const MOTIFS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "tous"];

const FORMAT_OPTIONS = [
  { value: "tous", label: "Tous formats" },
  { value: "PDF", label: "PDF uniquement" },
  { value: "JPG", label: "JPG uniquement" },
  { value: "PNG", label: "PNG uniquement" },
];

type PieceRequise = Database["public"]["Tables"]["pieces_requises"]["Row"];
type PieceRequiseInsert = Database["public"]["Tables"]["pieces_requises"]["Insert"];

interface AdminPiecesRequisesProps {
  readOnly?: boolean;
}

const emptyForm = {
  type_visa: "tous",
  motifs_concernes: ["tous"] as string[],
  nom_piece: "",
  description_simple: "",
  pourquoi_necessaire: "",
  obligatoire: false,
  conditionnel: false,
  condition_declenchement: "",
  alternative_possible: "",
  format_accepte: "tous",
  taille_max_mo: 10,
  traduction_requise: false,
  apostille_requise: false,
  original_requis: false,
  ordre_affichage: 0,
  note: "",
};

export function AdminPiecesRequises({ readOnly = false }: AdminPiecesRequisesProps) {
  const [pieces, setPieces] = useState<PieceRequise[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterVisa, setFilterVisa] = useState("all");
  const [filterMotif, setFilterMotif] = useState("all");
  const [filterOblig, setFilterOblig] = useState("all");
  const [filterActif, setFilterActif] = useState("all");
  const [activeTab, setActiveTab] = useState("list");

  const fetchPieces = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pieces_requises")
      .select("*")
      .order("ordre_affichage", { ascending: true });
    if (error) {
      toast.error("Erreur de chargement");
      console.error(error);
    } else {
      setPieces(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchPieces(); }, []);

  const handleMotifToggle = (motif: string) => {
    setForm((f) => {
      if (motif === "tous") {
        return { ...f, motifs_concernes: f.motifs_concernes.includes("tous") ? [] : ["tous"] };
      }
      const without = f.motifs_concernes.filter((m) => m !== "tous");
      const toggled = without.includes(motif)
        ? without.filter((m) => m !== motif)
        : [...without, motif];
      return { ...f, motifs_concernes: toggled.length === 0 ? ["tous"] : toggled };
    });
  };

  const handleSubmit = async () => {
    if (!form.nom_piece) {
      toast.error("Le nom de la pièce est obligatoire");
      return;
    }
    setSaving(true);
    const payload = {
      type_visa: form.type_visa,
      motifs_concernes: form.motifs_concernes,
      nom_piece: form.nom_piece,
      description_simple: form.description_simple,
      pourquoi_necessaire: form.pourquoi_necessaire || null,
      obligatoire: form.obligatoire,
      conditionnel: form.conditionnel,
      condition_declenchement: form.condition_declenchement || null,
      alternative_possible: form.alternative_possible || null,
      format_accepte: form.format_accepte,
      taille_max_mo: form.taille_max_mo,
      traduction_requise: form.traduction_requise,
      apostille_requise: form.apostille_requise,
      original_requis: form.original_requis,
      ordre_affichage: form.ordre_affichage,
      note: form.note || null,
    } satisfies PieceRequiseInsert;

    let error;
    if (editingId) {
      ({ error } = await supabase.from("pieces_requises").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("pieces_requises").insert(payload));
    }

    if (error) {
      toast.error("Erreur lors de l'enregistrement");
      console.error(error);
    } else {
      toast.success(editingId ? "Pièce mise à jour" : "Pièce ajoutée");
      setForm({ ...emptyForm });
      setEditingId(null);
      setActiveTab("list");
      fetchPieces();
    }
    setSaving(false);
  };

  const handleEdit = (p: PieceRequise) => {
    setEditingId(p.id);
    setForm({
      type_visa: p.type_visa,
      motifs_concernes: p.motifs_concernes || ["tous"],
      nom_piece: p.nom_piece,
      description_simple: p.description_simple,
      pourquoi_necessaire: p.pourquoi_necessaire || "",
      obligatoire: p.obligatoire,
      conditionnel: p.conditionnel,
      condition_declenchement: p.condition_declenchement || "",
      alternative_possible: p.alternative_possible || "",
      format_accepte: p.format_accepte,
      taille_max_mo: p.taille_max_mo,
      traduction_requise: p.traduction_requise,
      apostille_requise: p.apostille_requise,
      original_requis: p.original_requis,
      ordre_affichage: p.ordre_affichage,
      note: p.note || "",
    });
    setActiveTab("add");
  };

  const handleToggleActif = async (id: string, current: boolean) => {
    const { error } = await supabase.from("pieces_requises").update({ actif: !current }).eq("id", id);
    if (error) toast.error("Erreur");
    else { toast.success(current ? "Pièce désactivée" : "Pièce réactivée"); fetchPieces(); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer définitivement cette pièce ?")) return;
    const { error } = await supabase.from("pieces_requises").delete().eq("id", id);
    if (error) toast.error("Erreur");
    else { toast.success("Pièce supprimée"); fetchPieces(); }
  };

  const filteredPieces = useMemo(() => {
    return pieces.filter((p) => {
      if (filterVisa !== "all" && p.type_visa !== filterVisa) return false;
      if (filterMotif !== "all" && !(p.motifs_concernes || []).includes(filterMotif) && !(p.motifs_concernes || []).includes("tous")) return false;
      if (filterOblig !== "all") {
        if (filterOblig === "obligatoire" && !p.obligatoire) return false;
        if (filterOblig === "conditionnel" && !p.conditionnel) return false;
        if (filterOblig === "optionnel" && (p.obligatoire || p.conditionnel)) return false;
      }
      if (filterActif !== "all") {
        if (filterActif === "true" && !p.actif) return false;
        if (filterActif === "false" && p.actif) return false;
      }
      return true;
    });
  }, [pieces, filterVisa, filterMotif, filterOblig, filterActif]);

  // Stats
  const stats = useMemo(() => {
    const active = pieces.filter((p) => p.actif);
    const byVisa: Record<string, number> = {};
    for (const p of active) {
      byVisa[p.type_visa] = (byVisa[p.type_visa] || 0) + 1;
    }
    const obligCount = active.filter((p) => p.obligatoire).length;
    const condCount = active.filter((p) => p.conditionnel).length;
    const optCount = active.filter((p) => !p.obligatoire && !p.conditionnel).length;
    const tradCount = active.filter((p) => p.traduction_requise).length;
    return { total: active.length, byVisa, obligCount, condCount, optCount, tradCount };
  }, [pieces]);

  return (
    <div>
      <Eyebrow>Configuration</Eyebrow>
      <BigTitle>Pièces justificatives requises</BigTitle>
      {readOnly && (
        <div className="bg-primary/[0.09] border border-primary-hover/[0.22] rounded-[11px] p-4 mb-4">
          <h4 className="font-syne text-[0.83rem] font-bold mb-1 text-blue-300">Lecture seule</h4>
          <p className="text-[0.8rem] leading-relaxed text-blue-300/80">L'édition des pièces requises se fait depuis l'espace admin juridique.</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {[
          { val: stats.total, label: "Total actives", color: "text-primary-hover", top: "bg-primary-hover" },
          { val: stats.obligCount, label: "Obligatoires", color: "text-green-2", top: "bg-green-2" },
          { val: stats.condCount, label: "Conditionnelles", color: "text-amber-2", top: "bg-amber-2" },
          { val: stats.optCount, label: "Optionnelles", color: "text-muted-foreground", top: "bg-muted-foreground" },
          { val: stats.tradCount, label: "Traduction requise", color: "text-primary-hover", top: "bg-primary-hover" },
        ].map((k) => (
          <div key={k.label} className="bg-panel border border-border rounded-[10px] p-3 relative overflow-hidden">
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${k.top}`} />
            <div className={`font-syne font-extrabold text-2xl leading-none mb-1 ${k.color}`}>{k.val}</div>
            <div className="text-[0.7rem] text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      {/* By visa type */}
      <div className="bg-panel border border-border rounded-xl p-4 mb-5">
        <div className="font-syne font-bold text-sm mb-2">Répartition par type de visa</div>
        <div className="flex gap-2 flex-wrap">
          {VISA_TYPES.map((v) => (
            <div key={v.value} className="font-syne text-xs font-bold px-2.5 py-1 rounded-md border bg-primary/10 border-primary-hover/30 text-primary-hover">
              {v.label}: {stats.byVisa[v.value] || 0}
            </div>
          ))}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="list">Liste des pièces ({pieces.length})</TabsTrigger>
          {!readOnly && <TabsTrigger value="add">{editingId ? "Modifier" : "Ajouter"}</TabsTrigger>}
        </TabsList>

        {/* TAB — Liste */}
        <TabsContent value="list">
          <div className="bg-panel border border-border rounded-xl overflow-hidden">
            <div className="flex gap-2 p-3 border-b border-border flex-wrap bg-foreground/[0.015]">
              <Select value={filterVisa} onValueChange={setFilterVisa}>
                <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="Type visa" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les visas</SelectItem>
                  {VISA_TYPES.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterMotif} onValueChange={setFilterMotif}>
                <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="Motif" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous motifs</SelectItem>
                  {MOTIFS.filter((m) => m !== "tous").map((m) => <SelectItem key={m} value={m}>Motif {m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterOblig} onValueChange={setFilterOblig}>
                <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="obligatoire">Obligatoires</SelectItem>
                  <SelectItem value="conditionnel">Conditionnelles</SelectItem>
                  <SelectItem value="optionnel">Optionnelles</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterActif} onValueChange={setFilterActif}>
                <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue placeholder="Statut" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="true">Actif</SelectItem>
                  <SelectItem value="false">Inactif</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-8">#</TableHead>
                    <TableHead className="text-xs">Pièce</TableHead>
                    <TableHead className="text-xs">Visa</TableHead>
                    <TableHead className="text-xs">Motifs</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Trad.</TableHead>
                    <TableHead className="text-xs">Apost.</TableHead>
                    {!readOnly && <TableHead className="text-xs">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={readOnly ? 7 : 8} className="text-center text-muted-foreground py-8">Chargement…</TableCell></TableRow>
                  ) : filteredPieces.length === 0 ? (
                    <TableRow><TableCell colSpan={readOnly ? 7 : 8} className="text-center text-muted-foreground py-8">Aucune pièce trouvée</TableCell></TableRow>
                  ) : (
                    filteredPieces.map((p) => (
                      <TableRow key={p.id} className={!p.actif ? "opacity-50" : ""}>
                        <TableCell className="text-xs text-muted-foreground">{p.ordre_affichage}</TableCell>
                        <TableCell className="text-xs max-w-[250px]">
                          <div className="font-medium truncate" title={p.nom_piece}>{p.nom_piece}</div>
                          <div className="text-muted-foreground text-[0.65rem] truncate">{p.description_simple.substring(0, 80)}…</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="bg-secondary px-1.5 py-0.5 rounded text-[0.6rem] font-bold">{VISA_LABELS[p.type_visa] || p.type_visa}</span>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex gap-0.5 flex-wrap">
                            {(p.motifs_concernes || []).map((m) => (
                              <span key={m} className="bg-primary/10 text-primary-hover px-1.5 py-0.5 rounded text-[0.6rem] font-bold">{m}</span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {p.obligatoire ? (
                            <span className="text-green-2 font-semibold text-[0.65rem]">Obligatoire</span>
                          ) : p.conditionnel ? (
                            <span className="text-amber-2 font-semibold text-[0.65rem]">Conditionnel</span>
                          ) : (
                            <span className="text-muted-foreground text-[0.65rem]">Optionnel</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{p.traduction_requise ? "✓" : "—"}</TableCell>
                        <TableCell className="text-xs">{p.apostille_requise ? "✓" : "—"}</TableCell>
                        {!readOnly && (
                          <TableCell>
                            <div className="flex gap-1">
                              <button onClick={() => handleEdit(p)} className="bg-primary/10 border border-primary-hover/30 text-primary-hover rounded px-2 py-0.5 font-syne text-[0.6rem] font-bold hover:bg-primary/20">Modifier</button>
                              <button onClick={() => handleToggleActif(p.id, p.actif)} className="bg-foreground/[0.07] border border-border-2 text-muted-foreground rounded px-2 py-0.5 font-syne text-[0.6rem] font-bold hover:bg-foreground/10">{p.actif ? "Désact." : "Réact."}</button>
                              <button onClick={() => handleDelete(p.id)} className="bg-destructive/10 border border-destructive/30 text-destructive rounded px-2 py-0.5 font-syne text-[0.6rem] font-bold hover:bg-destructive/20">Suppr.</button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* TAB — Formulaire */}
        {!readOnly && <TabsContent value="add">
          <div className="bg-panel border border-border rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type de visa *</Label>
                <Select value={form.type_visa} onValueChange={(v) => setForm((f) => ({ ...f, type_visa: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VISA_TYPES.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Format accepté</Label>
                <Select value={form.format_accepte} onValueChange={(v) => setForm((f) => ({ ...f, format_accepte: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORMAT_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nom de la pièce *</Label>
              <Input value={form.nom_piece} onChange={(e) => setForm((f) => ({ ...f, nom_piece: e.target.value }))} placeholder="Ex: Attestation de Virement Irrévocable (AVI)" />
            </div>

            <div className="space-y-2">
              <Label>Description simple</Label>
              <Textarea value={form.description_simple} onChange={(e) => setForm((f) => ({ ...f, description_simple: e.target.value }))} placeholder="Description en langage courant de la pièce et de ce qu'elle doit contenir" className="min-h-[80px]" />
            </div>

            <div className="space-y-2">
              <Label>Pourquoi en a-t-on besoin ?</Label>
              <Textarea value={form.pourquoi_necessaire} onChange={(e) => setForm((f) => ({ ...f, pourquoi_necessaire: e.target.value }))} placeholder="Expliquez pourquoi la commission a besoin de cette pièce" className="min-h-[60px]" />
            </div>

            <div className="space-y-2">
              <Label>Motifs concernés</Label>
              <div className="flex gap-2 flex-wrap">
                {MOTIFS.map((m) => (
                  <div key={m} className="flex items-center gap-1.5">
                    <Checkbox checked={form.motifs_concernes.includes(m)} onCheckedChange={() => handleMotifToggle(m)} />
                    <span className="text-sm">{m === "tous" ? "Tous" : m}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={form.obligatoire} onCheckedChange={(c) => setForm((f) => ({ ...f, obligatoire: c, conditionnel: c ? false : f.conditionnel }))} />
                <Label>Obligatoire</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.conditionnel} onCheckedChange={(c) => setForm((f) => ({ ...f, conditionnel: c, obligatoire: c ? false : f.obligatoire }))} />
                <Label>Conditionnel</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.traduction_requise} onCheckedChange={(c) => setForm((f) => ({ ...f, traduction_requise: c }))} />
                <Label>Traduction</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.apostille_requise} onCheckedChange={(c) => setForm((f) => ({ ...f, apostille_requise: c }))} />
                <Label>Apostille</Label>
              </div>
            </div>

            {form.conditionnel && (
              <div className="space-y-2">
                <Label>Condition de déclenchement</Label>
                <Input value={form.condition_declenchement} onChange={(e) => setForm((f) => ({ ...f, condition_declenchement: e.target.value }))} placeholder='Ex: Si le motif est F' />
              </div>
            )}

            <div className="space-y-2">
              <Label>Alternative possible</Label>
              <Input value={form.alternative_possible} onChange={(e) => setForm((f) => ({ ...f, alternative_possible: e.target.value }))} placeholder="Ex: À défaut de titre de propriété, un contrat CDI est accepté" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Taille max (Mo)</Label>
                <Input type="number" value={form.taille_max_mo} onChange={(e) => setForm((f) => ({ ...f, taille_max_mo: parseInt(e.target.value) || 10 }))} />
              </div>
              <div className="space-y-2">
                <Label>Ordre d'affichage</Label>
                <Input type="number" value={form.ordre_affichage} onChange={(e) => setForm((f) => ({ ...f, ordre_affichage: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={form.original_requis} onCheckedChange={(c) => setForm((f) => ({ ...f, original_requis: c }))} />
                <Label>Original requis</Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Note interne</Label>
              <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Note visible uniquement par les admins" />
            </div>

            <div className="flex gap-3">
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? "Enregistrement…" : editingId ? "Mettre à jour" : "Ajouter la pièce"}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={() => { setEditingId(null); setForm({ ...emptyForm }); setActiveTab("list"); }}>
                  Annuler
                </Button>
              )}
            </div>
          </div>
        </TabsContent>}
      </Tabs>
    </div>
  );
}
