import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { Eyebrow, BigTitle, Box } from "@/components/ui-custom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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

const CATEGORIES = [
  { value: "texte_loi", label: "Article de loi (CESEDA, CPCE, etc.)" },
  { value: "decret", label: "Décret ou arrêté" },
  { value: "jurisprudence_ta", label: "Jurisprudence TA Nantes" },
  { value: "jurisprudence_caa", label: "Jurisprudence CAA Nantes" },
  { value: "jurisprudence_ce", label: "Jurisprudence Conseil d'État" },
  { value: "jurisprudence_cedh", label: "Jurisprudence CEDH" },
  { value: "circulaire", label: "Circulaire ministérielle" },
];

const CATEGORY_LABELS: Record<string, string> = {
  texte_loi: "Article de loi",
  decret: "Décret",
  jurisprudence_ta: "Jurisp. TA",
  jurisprudence_caa: "Jurisp. CAA",
  jurisprudence_ce: "Jurisp. CE",
  jurisprudence_cedh: "Jurisp. CEDH",
  circulaire: "Circulaire",
};

const MOTIFS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

const ARGUMENT_TYPES = [
  { value: "erreur_manifeste", label: "Erreur manifeste d'appréciation" },
  { value: "defaut_motivation", label: "Défaut de motivation suffisante" },
  { value: "art8_cedh", label: "Violation article 8 CEDH" },
  { value: "regime_conjoint_francais", label: "Régime protecteur conjoint de Français" },
  { value: "proportionnalite", label: "Proportionnalité" },
  { value: "violation_delai", label: "Violation délai raisonnable" },
  { value: "autre", label: "Autre" },
];

const FAVORABLE_OPTIONS = [
  { value: "true", label: "Oui — annulation du refus" },
  { value: "false", label: "Non — confirmation du refus" },
  { value: "mixte", label: "Mixte ou partiel" },
  { value: "na", label: "Non applicable (texte de loi)" },
];

type RefJuridique = Database["public"]["Tables"]["references_juridiques"]["Row"];
type RefJuridiqueInsert = Database["public"]["Tables"]["references_juridiques"]["Insert"];

interface AdminReferencesJuridiquesProps {
  readOnly?: boolean;
}

const emptyForm = {
  categorie: "",
  reference_complete: "",
  intitule_court: "",
  texte_exact: "",
  resume_vulgarise: "",
  motifs_concernes: [] as string[],
  argument_type: "autre",
  favorable_demandeur: "true",
  juridiction: "",
  date_decision: "",
  date_verification: "",
  verifie_par: "Me NGUIYAN",
  source_url: "",
};

export function AdminReferencesJuridiques({ readOnly = false }: AdminReferencesJuridiquesProps) {
  const [refs, setRefs] = useState<RefJuridique[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterCat, setFilterCat] = useState("all");
  const [filterMotif, setFilterMotif] = useState("all");
  const [filterFavorable, setFilterFavorable] = useState("all");
  const [filterActif, setFilterActif] = useState("all");
  const csvInputRef = useRef<HTMLInputElement>(null);

  const fetchRefs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("references_juridiques")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erreur de chargement des références");
      console.error(error);
    } else {
      setRefs(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchRefs(); }, []);

  const handleMotifToggle = (motif: string) => {
    if (motif === "ALL") {
      setForm((f) => ({
        ...f,
        motifs_concernes: f.motifs_concernes.length === MOTIFS.length ? [] : [...MOTIFS],
      }));
    } else {
      setForm((f) => ({
        ...f,
        motifs_concernes: f.motifs_concernes.includes(motif)
          ? f.motifs_concernes.filter((m) => m !== motif)
          : [...f.motifs_concernes, motif],
      }));
    }
  };

  const handleSubmit = async () => {
    if (!form.categorie || !form.reference_complete || !form.intitule_court) {
      toast.error("Catégorie, référence complète et intitulé court sont obligatoires");
      return;
    }
    setSaving(true);
    const payload = {
      categorie: form.categorie,
      reference_complete: form.reference_complete,
      intitule_court: form.intitule_court,
      texte_exact: form.texte_exact,
      resume_vulgarise: form.resume_vulgarise || null,
      motifs_concernes: form.motifs_concernes,
      argument_type: form.argument_type,
      favorable_demandeur: form.favorable_demandeur === "na" ? null : form.favorable_demandeur === "true",
      juridiction: form.juridiction || null,
      date_decision: form.date_decision || null,
      date_verification: form.date_verification || null,
      verifie_par: form.verifie_par || null,
      source_url: form.source_url || null,
    } satisfies RefJuridiqueInsert;

    let error;
    if (editingId) {
      ({ error } = await supabase
        .from("references_juridiques")
        .update(payload)
        .eq("id", editingId));
    } else {
      ({ error } = await supabase
        .from("references_juridiques")
        .insert(payload));
    }

    if (error) {
      toast.error("Erreur lors de l'enregistrement");
      console.error(error);
    } else {
      toast.success(editingId ? "Référence mise à jour" : "Référence ajoutée à la base juridique");
      setForm({ ...emptyForm });
      setEditingId(null);
      fetchRefs();
    }
    setSaving(false);
  };

  const handleEdit = (ref: RefJuridique) => {
    setEditingId(ref.id);
    setForm({
      categorie: ref.categorie,
      reference_complete: ref.reference_complete,
      intitule_court: ref.intitule_court,
      texte_exact: ref.texte_exact,
      resume_vulgarise: ref.resume_vulgarise || "",
      motifs_concernes: ref.motifs_concernes || [],
      argument_type: ref.argument_type,
      favorable_demandeur: ref.favorable_demandeur === null ? "na" : ref.favorable_demandeur ? "true" : "false",
      juridiction: ref.juridiction || "",
      date_decision: ref.date_decision || "",
      date_verification: ref.date_verification || "",
      verifie_par: ref.verifie_par || "",
      source_url: ref.source_url || "",
    });
  };

  const handleArchive = async (id: string, currentActif: boolean) => {
    const { error } = await supabase
      .from("references_juridiques")
      .update({ actif: !currentActif })
      .eq("id", id);
    if (error) toast.error("Erreur");
    else {
      toast.success(currentActif ? "Référence archivée" : "Référence réactivée");
      fetchRefs();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer définitivement cette référence ?")) return;
    const { error } = await supabase
      .from("references_juridiques")
      .delete()
      .eq("id", id);
    if (error) toast.error("Erreur de suppression");
    else { toast.success("Référence supprimée"); fetchRefs(); }
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) { toast.error("Fichier CSV vide ou invalide"); return; }

    const rows: RefJuridiqueInsert[] = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      return {
        categorie: cols[0] || "texte_loi",
        reference_complete: cols[1] || "",
        intitule_court: cols[2] || "",
        texte_exact: cols[3] || "",
        resume_vulgarise: cols[4] || null,
        motifs_concernes: cols[5] ? cols[5].split(";").map((m) => m.trim()) : [],
        argument_type: cols[6] || "autre",
        favorable_demandeur: cols[7] === "true" ? true : cols[7] === "false" ? false : null,
        juridiction: cols[8] || null,
        date_decision: cols[9] || null,
        source_url: cols[10] || null,
      };
    }).filter((r) => r.reference_complete);

    if (rows.length === 0) { toast.error("Aucune ligne valide dans le CSV"); return; }

    const { error } = await supabase
      .from("references_juridiques")
      .insert(rows);
    if (error) {
      toast.error("Erreur lors de l'import CSV");
      console.error(error);
    } else {
      toast.success(`${rows.length} référence(s) importée(s)`);
      fetchRefs();
    }
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const downloadCsvTemplate = () => {
    const header = "categorie,reference_complete,intitule_court,texte_exact,resume_vulgarise,motifs_concernes,argument_type,favorable_demandeur,juridiction,date_decision,source_url";
    const example = 'texte_loi,"Art. L211-2 CESEDA","Motivation des refus de visa","Le texte exact...","Explication simple","F;B",defaut_motivation,true,Legifrance,2024-01-15,https://www.legifrance.gouv.fr/...';
    const blob = new Blob([header + "\n" + example], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modele_references_juridiques.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered refs
  const filteredRefs = useMemo(() => {
    return refs.filter((r) => {
      if (filterCat !== "all" && r.categorie !== filterCat) return false;
      if (filterMotif !== "all" && !(r.motifs_concernes || []).includes(filterMotif)) return false;
      if (filterFavorable !== "all") {
        if (filterFavorable === "true" && r.favorable_demandeur !== true) return false;
        if (filterFavorable === "false" && r.favorable_demandeur !== false) return false;
      }
      if (filterActif !== "all") {
        if (filterActif === "true" && !r.actif) return false;
        if (filterActif === "false" && r.actif) return false;
      }
      return true;
    });
  }, [refs, filterCat, filterMotif, filterFavorable, filterActif]);

  // Stats
  const stats = useMemo(() => {
    const activeRefs = refs.filter((r) => r.actif);
    const byCat: Record<string, number> = {};
    const byMotif: Record<string, number> = {};
    for (const r of activeRefs) {
      byCat[r.categorie] = (byCat[r.categorie] || 0) + 1;
      for (const m of r.motifs_concernes || []) {
        byMotif[m] = (byMotif[m] || 0) + 1;
      }
    }
    const underCovered = MOTIFS.filter((m) => (byMotif[m] || 0) < 3);
    return { total: activeRefs.length, byCat, byMotif, underCovered };
  }, [refs]);

  return (
    <div>
      <Eyebrow>Base juridique</Eyebrow>
      <BigTitle>Références juridiques</BigTitle>
      {readOnly && (
        <Box variant="info" title="Lecture seule">
          L'édition des références juridiques se fait depuis l'espace admin juridique.
        </Box>
      )}

      {/* SECTION 4 — Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-panel border border-border rounded-[10px] p-3 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary-hover" />
          <div className="font-syne font-extrabold text-2xl leading-none mb-1 text-primary-hover">{stats.total}</div>
          <div className="text-[0.7rem] text-muted-foreground">Références actives</div>
        </div>
        {[
          { cat: "texte_loi", color: "bg-primary-hover", textColor: "text-primary-hover" },
          { cat: "jurisprudence_ta", color: "bg-green-2", textColor: "text-green-2" },
          { cat: "jurisprudence_caa", color: "bg-amber-2", textColor: "text-amber-2" },
        ].map((c) => (
          <div key={c.cat} className="bg-panel border border-border rounded-[10px] p-3 relative overflow-hidden">
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${c.color}`} />
            <div className={`font-syne font-extrabold text-2xl leading-none mb-1 ${c.textColor}`}>{stats.byCat[c.cat] || 0}</div>
            <div className="text-[0.7rem] text-muted-foreground">{CATEGORY_LABELS[c.cat]}</div>
          </div>
        ))}
      </div>

      {/* Motifs coverage */}
      <div className="bg-panel border border-border rounded-xl p-4 mb-5">
        <div className="font-syne font-bold text-sm mb-2">Couverture par motif</div>
        <div className="flex gap-2 flex-wrap mb-3">
          {MOTIFS.map((m) => (
            <div key={m} className={`font-syne text-xs font-bold px-2.5 py-1 rounded-md border ${(stats.byMotif[m] || 0) >= 3 ? "bg-primary/10 border-primary-hover/30 text-primary-hover" : "bg-destructive/10 border-destructive/30 text-destructive"}`}>
              {m}:{stats.byMotif[m] || 0}
            </div>
          ))}
        </div>
        {stats.underCovered.length > 0 && (
          <div className="text-xs text-destructive">⚠️ Motifs avec moins de 3 références : {stats.underCovered.join(", ")}</div>
        )}
      </div>

      <Tabs defaultValue="list" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="list">Liste des références</TabsTrigger>
          {!readOnly && <TabsTrigger value="add">{editingId ? "Modifier" : "Ajouter"}</TabsTrigger>}
          {!readOnly && <TabsTrigger value="import">Import CSV</TabsTrigger>}
        </TabsList>

        {/* TAB — Formulaire */}
        {!readOnly && <TabsContent value="add">
          <div className="bg-panel border border-border rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Catégorie *</Label>
                <Select value={form.categorie} onValueChange={(v) => setForm((f) => ({ ...f, categorie: v }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type d'argument</Label>
                <Select value={form.argument_type} onValueChange={(v) => setForm((f) => ({ ...f, argument_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ARGUMENT_TYPES.map((a) => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Référence complète *</Label>
              <Input
                value={form.reference_complete}
                onChange={(e) => setForm((f) => ({ ...f, reference_complete: e.target.value }))}
                placeholder="Ex: CAA Nantes, 3e ch., 3 déc. 2021, n°21NT02481, M. X c/ Ministre de l'Europe et des Affaires Étrangères"
              />
            </div>

            <div className="space-y-2">
              <Label>Intitulé court *</Label>
              <Input
                value={form.intitule_court}
                onChange={(e) => setForm((f) => ({ ...f, intitule_court: e.target.value }))}
                placeholder="Ex: Insuffisance de motivation — Motif F — Favorable"
              />
            </div>

            <div className="space-y-2">
              <Label>Texte exact</Label>
              <Textarea
                value={form.texte_exact}
                onChange={(e) => setForm((f) => ({ ...f, texte_exact: e.target.value }))}
                placeholder="Collez ici le texte exact de l'article ou de l'extrait de la décision"
                className="min-h-[120px]"
              />
            </div>

            <div className="space-y-2">
              <Label>Résumé vulgarisé</Label>
              <Textarea
                value={form.resume_vulgarise}
                onChange={(e) => setForm((f) => ({ ...f, resume_vulgarise: e.target.value }))}
                placeholder="Expliquez en langage simple ce que dit ce texte et comment il aide le client"
                className="min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label>Motifs concernés</Label>
              <div className="flex gap-2 flex-wrap">
                {MOTIFS.map((m) => (
                  <div key={m} className="flex items-center gap-1.5">
                    <Checkbox
                      checked={form.motifs_concernes.includes(m)}
                      onCheckedChange={() => handleMotifToggle(m)}
                    />
                    <span className="text-sm">{m}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5 ml-2">
                  <Checkbox
                    checked={form.motifs_concernes.length === MOTIFS.length}
                    onCheckedChange={() => handleMotifToggle("ALL")}
                  />
                  <span className="text-sm font-semibold">Tous</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Favorable au demandeur</Label>
                <Select value={form.favorable_demandeur} onValueChange={(v) => setForm((f) => ({ ...f, favorable_demandeur: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FAVORABLE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Juridiction</Label>
                <Input
                  value={form.juridiction}
                  onChange={(e) => setForm((f) => ({ ...f, juridiction: e.target.value }))}
                  placeholder="CRRV / TA_Nantes / CAA_Nantes / CE / CEDH / Legifrance"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Date de décision</Label>
                <Input type="date" value={form.date_decision} onChange={(e) => setForm((f) => ({ ...f, date_decision: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Date de vérification</Label>
                <Input type="date" value={form.date_verification} onChange={(e) => setForm((f) => ({ ...f, date_verification: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Vérifié par</Label>
                <Input value={form.verifie_par} onChange={(e) => setForm((f) => ({ ...f, verifie_par: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Source URL</Label>
              <Input
                value={form.source_url}
                onChange={(e) => setForm((f) => ({ ...f, source_url: e.target.value }))}
                placeholder="https://www.legifrance.gouv.fr/..."
              />
            </div>

            <div className="flex gap-3">
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? "Enregistrement…" : editingId ? "Mettre à jour" : "Ajouter à la base juridique"}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={() => { setEditingId(null); setForm({ ...emptyForm }); }}>
                  Annuler
                </Button>
              )}
            </div>
          </div>
        </TabsContent>}

        {/* TAB — Liste */}
        <TabsContent value="list">
          <div className="bg-panel border border-border rounded-xl overflow-hidden">
            {/* Filtres */}
            <div className="flex gap-2 p-3 border-b border-border flex-wrap bg-foreground/[0.015]">
              <Select value={filterCat} onValueChange={setFilterCat}>
                <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Catégorie" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes catégories</SelectItem>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterMotif} onValueChange={setFilterMotif}>
                <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="Motif" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous motifs</SelectItem>
                  {MOTIFS.map((m) => <SelectItem key={m} value={m}>Motif {m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterFavorable} onValueChange={setFilterFavorable}>
                <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Favorable" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="true">Favorable</SelectItem>
                  <SelectItem value="false">Défavorable</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterActif} onValueChange={setFilterActif}>
                <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="Statut" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="true">Actif</SelectItem>
                  <SelectItem value="false">Archivé</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Référence</TableHead>
                    <TableHead className="text-xs">Catégorie</TableHead>
                    <TableHead className="text-xs">Motifs</TableHead>
                    <TableHead className="text-xs">Favorable ?</TableHead>
                    <TableHead className="text-xs">Date décision</TableHead>
                    <TableHead className="text-xs">Vérifié par</TableHead>
                    <TableHead className="text-xs">Vérification</TableHead>
                    {!readOnly && <TableHead className="text-xs">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={readOnly ? 7 : 8} className="text-center text-muted-foreground py-8">Chargement…</TableCell></TableRow>
                  ) : filteredRefs.length === 0 ? (
                    <TableRow><TableCell colSpan={readOnly ? 7 : 8} className="text-center text-muted-foreground py-8">Aucune référence trouvée</TableCell></TableRow>
                  ) : (
                    filteredRefs.map((ref) => (
                      <TableRow key={ref.id} className={!ref.actif ? "opacity-50" : ""}>
                        <TableCell className="text-xs font-medium max-w-[250px]">
                          <div className="truncate" title={ref.reference_complete}>{ref.reference_complete}</div>
                          <div className="text-muted-foreground text-[0.65rem]">{ref.intitule_court}</div>
                        </TableCell>
                        <TableCell className="text-xs">{CATEGORY_LABELS[ref.categorie] || ref.categorie}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex gap-0.5 flex-wrap">
                            {(ref.motifs_concernes || []).map((m) => (
                              <span key={m} className="bg-primary/10 text-primary-hover px-1.5 py-0.5 rounded text-[0.6rem] font-bold">{m}</span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {ref.favorable_demandeur === null ? "—" : ref.favorable_demandeur ? (
                            <span className="text-green-2 font-semibold">✓ Oui</span>
                          ) : (
                            <span className="text-destructive font-semibold">✗ Non</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{ref.date_decision || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{ref.verifie_par || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{ref.date_verification || "—"}</TableCell>
                        {!readOnly && (
                          <TableCell>
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleEdit(ref)}
                                className="bg-primary/10 border border-primary-hover/30 text-primary-hover rounded px-2 py-0.5 font-syne text-[0.6rem] font-bold hover:bg-primary/20"
                              >Modifier</button>
                              <button
                                onClick={() => handleArchive(ref.id, ref.actif)}
                                className="bg-foreground/[0.07] border border-border-2 text-muted-foreground rounded px-2 py-0.5 font-syne text-[0.6rem] font-bold hover:bg-foreground/10"
                              >{ref.actif ? "Archiver" : "Réactiver"}</button>
                              <button
                                onClick={() => handleDelete(ref.id)}
                                className="bg-destructive/10 border border-destructive/30 text-destructive rounded px-2 py-0.5 font-syne text-[0.6rem] font-bold hover:bg-destructive/20"
                              >Suppr.</button>
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

        {/* TAB — Import CSV */}
        {!readOnly && <TabsContent value="import">
          <div className="bg-panel border border-border rounded-xl p-5 space-y-4">
            <div className="font-syne font-bold text-sm mb-2">Import en masse CSV</div>
            <p className="text-sm text-muted-foreground">
              Importez un fichier CSV avec les colonnes : categorie, reference_complete, intitule_court, texte_exact,
              resume_vulgarise, motifs_concernes (séparés par ;), argument_type, favorable_demandeur, juridiction,
              date_decision, source_url.
            </p>
            <div className="flex gap-3 items-center">
              <Button variant="outline" size="sm" onClick={downloadCsvTemplate}>
                📥 Télécharger le modèle CSV
              </Button>
              <div>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCsvImport}
                  className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary-hover hover:file:bg-primary/20"
                />
              </div>
            </div>
          </div>
        </TabsContent>}
      </Tabs>
    </div>
  );
}
