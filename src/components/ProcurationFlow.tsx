import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ProfileData {
  last_name: string;
  first_name: string;
  date_naissance: string;
  lieu_naissance: string;
  nationalite: string;
  passport_number: string;
  adresse_ligne1: string;
  adresse_ligne2: string;
  code_postal: string;
  ville: string;
  pays: string;
  phone: string;
  prefixe_telephone: string;
}

interface ProcurationFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dossierRef: string;
  dossierId: string;
  userId: string;
  userEmail: string;
  onComplete?: () => void;
  onSkip?: () => void;
}

type Step = "verify" | "consent" | "signing" | "otp";

// WinAnsiEncoding map for common French/special characters
const WINANSI_MAP: Record<number, number> = {
  0x2013: 0x96, // en dash
  0x2014: 0x97, // em dash —
  0x2018: 0x91, // '
  0x2019: 0x92, // '
  0x201C: 0x93, // "
  0x201D: 0x94, // "
  0x2026: 0x85, // …
  0x2022: 0x95, // •
  0x0152: 0x8C, // Œ
  0x0153: 0x9C, // œ
};

function charToWinAnsi(ch: string): number | null {
  const code = ch.charCodeAt(0);
  if (code <= 0xFF) return code; // Latin-1 range (includes é, è, à, ç, etc.)
  return WINANSI_MAP[code] ?? null;
}

function escPdfString(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = charToWinAnsi(ch);
    if (code === null) {
      out += "-"; // fallback for unsupported chars
    } else if (code === 0x28) {
      out += "\\(";
    } else if (code === 0x29) {
      out += "\\)";
    } else if (code === 0x5C) {
      out += "\\\\";
    } else if (code >= 0x80) {
      out += "\\" + code.toString(8).padStart(3, "0");
    } else {
      out += ch;
    }
  }
  return out;
}

// Approximate character width for Helvetica at size 10 (in PDF units / 1000)
function approxCharWidth(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code >= 0x61 && code <= 0x7A) return 500; // lowercase
  if (code >= 0x41 && code <= 0x5A) return 650; // uppercase
  if (ch === " ") return 250;
  if (ch === "-") return 333;
  return 500;
}

function wrapLine(line: string, maxWidthPt: number, fontSize: number): string[] {
  const scale = fontSize / 1000;
  const maxWidth = maxWidthPt / scale;
  const words = line.split(" ");
  const wrapped: string[] = [];
  let current = "";
  let currentWidth = 0;

  for (const word of words) {
    let wordWidth = 0;
    for (const ch of word) wordWidth += approxCharWidth(ch);
    const spaceWidth = current ? 250 : 0;
    if (current && currentWidth + spaceWidth + wordWidth > maxWidth) {
      wrapped.push(current);
      current = word;
      currentWidth = wordWidth;
    } else {
      current = current ? current + " " + word : word;
      currentWidth += spaceWidth + wordWidth;
    }
  }
  if (current) wrapped.push(current);
  return wrapped.length ? wrapped : [""];
}

// Minimal PDF generator with proper French character support
function textToPdfBase64(text: string): string {
  const pageHeight = 842;
  const pageWidth = 595;
  const margin = 50;
  const fontSize = 10;
  const lineHeight = 14;
  const contentWidth = pageWidth - 2 * margin;
  const maxLinesPerPage = Math.floor((pageHeight - 2 * margin) / lineHeight);

  // Pre-process: wrap all lines
  const rawLines = text.split("\n");
  const allLines: string[] = [];
  for (const raw of rawLines) {
    if (raw.trim() === "") {
      allLines.push("");
    } else if (raw.startsWith("- ")) {
      const wrapped = wrapLine(raw, contentWidth, fontSize);
      allLines.push(...wrapped);
    } else {
      const wrapped = wrapLine(raw, contentWidth, fontSize);
      allLines.push(...wrapped);
    }
  }

  // Paginate
  const pages: string[][] = [];
  for (let i = 0; i < allLines.length; i += maxLinesPerPage) {
    pages.push(allLines.slice(i, i + maxLinesPerPage));
  }
  if (pages.length === 0) pages.push([""]);

  let objects: string[] = [];
  let objectOffsets: number[] = [];
  let currentOffset = 0;
  const addObject = (content: string) => {
    objectOffsets.push(currentOffset);
    objects.push(content);
    currentOffset += content.length;
  };
  const header = "%PDF-1.4\n";
  currentOffset = header.length;
  addObject(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  const pageObjRefs = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  addObject(`2 0 obj\n<< /Type /Pages /Kids [${pageObjRefs}] /Count ${pages.length} >>\nendobj\n`);
  const fontObjNum = 3 + pages.length * 2;
  pages.forEach((pageLines, idx) => {
    const pageObjNum = 3 + idx * 2;
    const contentObjNum = pageObjNum + 1;
    let stream = `BT\n/F1 ${fontSize} Tf\n${margin} ${pageHeight - margin} Td\n`;
    for (const line of pageLines) {
      const escaped = escPdfString(line);
      stream += `(${escaped}) Tj\n0 -${lineHeight} Td\n`;
    }
    stream += "ET\n";
    addObject(`${contentObjNum} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`);
    addObject(`${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentObjNum} 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> >>\nendobj\n`);
  });
  addObject(`${fontObjNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`);
  const xrefOffset = header.length + objects.reduce((s, o) => s + o.length, 0);
  const numObjects = objects.length + 1;
  let pdf = header;
  pdf += objects.join("");
  pdf += `xref\n0 ${numObjects}\n0000000000 65535 f \n`;
  for (const off of objectOffsets) {
    pdf += `${String(off + header.length).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${numObjects} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return btoa(Array.from(new TextEncoder().encode(pdf)).map((b) => String.fromCharCode(b)).join(""));
}

function formatDateToLetters(dateStr: string): string {
  const months = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  }
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function generateProcurationData(p: ProfileData, dossierRef: string, email?: string) {
  const nom = (p.last_name || "").toUpperCase();
  const prenom = p.first_name || "";
  const adresseLigne2 = p.adresse_ligne2 ? `\n${p.adresse_ligne2}` : "";
  const pays = (p.pays || "Cameroun").toUpperCase();
  const ville = p.ville || "";
  const tel = p.phone ? `${p.prefixe_telephone || "+237"} ${p.phone}` : "";
  const today = formatDateToLetters(new Date().toISOString());
  const emailStr = email || "";

  // Display version (with accents for UI)
  const display = `PROCURATION POSTALE

Je soussigné(e),

Nom et prénom : ${nom} ${prenom}
Date de naissance : ${p.date_naissance || ""}
Lieu de naissance : ${p.lieu_naissance || ""}
Nationalité : ${p.nationalite || ""}
Numéro de passeport : ${p.passport_number || ""}
Adresse personnelle :
${p.adresse_ligne1 || ""}${adresseLigne2}
${ville}, ${pays}
Téléphone : ${tel}
Email : ${emailStr}

DONNE PROCURATION à :

La société CAPDEMARCHES
Sise au 105 rue des Moines
75017 Paris - FRANCE
Email : contact@capdemarches.fr

pour réceptionner, retirer et prendre connaissance en mon nom de tout courrier recommandé avec accusé de réception, de tout avis de passage et de toute correspondance officielle qui me seraient adressés à l'adresse suivante :

${nom} ${prenom}
c/o CAPDEMARCHES
105 rue des Moines
75017 Paris
FRANCE

dans le cadre de la procédure de recours contre la décision de refus de visa introduite auprès de la Commission de recours contre les décisions de refus de visa d'entrée en France ou du Sous-directeur des visas, selon le type de visa concerné.

Référence dossier IZY : ${dossierRef}

Durée de validité : douze (12) mois à compter de la date de signature, renouvelable.

Cette procuration couvre :
- La réception des courriers recommandés avec accusé de réception
- La signature des accusés de réception au nom du mandant
- Le retrait des courriers en instance auprès des bureaux de La Poste
- La transmission numérique des documents reçus au mandant dans un délai de 24 heures

Cette procuration ne couvre pas :
- La représentation du mandant devant toute juridiction
- La signature de tout acte juridique engageant le mandant
- Toute action étrangère à la procédure de recours visa

Fait à ${ville},
le ${today}

Signature du mandant :
[ZONE DE SIGNATURE YOUSIGN]

Nom lisible : ${nom} ${prenom}`;

  // PDF-safe version (ASCII only for Helvetica/WinAnsi)
  const pdf = display
    .replace(/é/g, "e").replace(/è/g, "e").replace(/ê/g, "e").replace(/ë/g, "e")
    .replace(/à/g, "a").replace(/â/g, "a")
    .replace(/ù/g, "u").replace(/û/g, "u")
    .replace(/ô/g, "o").replace(/î/g, "i").replace(/ï/g, "i")
    .replace(/ç/g, "c")
    .replace(/É/g, "E").replace(/È/g, "E").replace(/Ê/g, "E")
    .replace(/À/g, "A").replace(/Ô/g, "O").replace(/Ù/g, "U")
    .replace(/Ç/g, "C")
    .replace(/œ/g, "oe").replace(/Œ/g, "OE")
    .replace(/—/g, "-").replace(/–/g, "-")
    .replace(/'/g, "'").replace(/'/g, "'")
    .replace(/"/g, '"').replace(/"/g, '"');

  return { display, pdf };
}

export const ProcurationFlow = ({
  open,
  onOpenChange,
  dossierRef,
  dossierId,
  userId,
  userEmail,
  onComplete,
  onSkip,
}: ProcurationFlowProps) => {
  const [step, setStep] = useState<Step>("verify");
  const [previewMode, setPreviewMode] = useState<"text" | "pdf">("text");
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData>({
    last_name: "", first_name: "", date_naissance: "", lieu_naissance: "",
    nationalite: "", passport_number: "", adresse_ligne1: "", adresse_ligne2: "",
    code_postal: "", ville: "", pays: "Cameroun", phone: "", prefixe_telephone: "+237",
  });
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<ProfileData>>({});
  const [draftMissing, setDraftMissing] = useState<Partial<ProfileData>>({});
  const [checks, setChecks] = useState({ lu: false, autorise: false, comprends: false });
  const [certifie, setCertifie] = useState(false);
  const [signatureRequestId, setSignatureRequestId] = useState("");
  const [signerId, setSignerId] = useState("");
  const [otpValue, setOtpValue] = useState("");
  const [isSandbox, setIsSandbox] = useState(false);
  const [sandboxTestOtpEnabled, setSandboxTestOtpEnabled] = useState(false);

  // Load profile
  useEffect(() => {
    if (!open || !userId) return;
    const loadProfile = async () => {
      setProfileLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name, date_naissance, lieu_naissance, nationalite, passport_number, adresse_ligne1, adresse_ligne2, code_postal, ville, pays, phone, prefixe_telephone")
        .eq("id", userId)
        .single();
      if (data) {
        setProfile({
          last_name: data.last_name || "",
          first_name: data.first_name || "",
          date_naissance: data.date_naissance || "",
          lieu_naissance: data.lieu_naissance || "",
          nationalite: data.nationalite || "",
          passport_number: data.passport_number || "",
          adresse_ligne1: data.adresse_ligne1 || "",
          adresse_ligne2: data.adresse_ligne2 || "",
          code_postal: data.code_postal || "",
          ville: data.ville || "",
          pays: data.pays || "Cameroun",
          phone: data.phone || "",
          prefixe_telephone: data.prefixe_telephone || "+237",
        });
      }
      setProfileLoading(false);
    };
    loadProfile();
  }, [open, userId]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep("verify");
      setChecks({ lu: false, autorise: false, comprends: false });
      setCertifie(false);
      setOtpValue("");
      setEditingField(null);
    }
  }, [open]);

  const requiredFields: { key: keyof ProfileData; label: string }[] = [
    { key: "last_name", label: "Nom" },
    { key: "first_name", label: "Prénom" },
    { key: "date_naissance", label: "Date de naissance" },
    { key: "lieu_naissance", label: "Lieu de naissance" },
    { key: "nationalite", label: "Nationalité" },
    { key: "passport_number", label: "N° de passeport" },
    { key: "adresse_ligne1", label: "Adresse" },
    { key: "ville", label: "Ville" },
    { key: "pays", label: "Pays" },
    { key: "phone", label: "Téléphone WhatsApp" },
  ];

  const missingFields = requiredFields.filter(f => !profile[f.key]);
  const allFieldsFilled = missingFields.length === 0;

  const displayFields = [
    { label: "Nom complet", value: `${(profile.last_name || "").toUpperCase()} ${profile.first_name}` },
    { label: "Date de naissance", value: profile.date_naissance, key: "date_naissance" as const },
    { label: "Lieu de naissance", value: profile.lieu_naissance, key: "lieu_naissance" as const },
    { label: "Nationalité", value: profile.nationalite, key: "nationalite" as const },
    { label: "N° de passeport", value: profile.passport_number, key: "passport_number" as const },
    { label: "Adresse", value: [profile.adresse_ligne1, profile.adresse_ligne2, `${profile.ville}, ${(profile.pays || "").toUpperCase()}`].filter(Boolean).join(", "), key: "adresse_ligne1" as const },
    { label: "Téléphone WhatsApp", value: profile.phone ? `${profile.prefixe_telephone} ${profile.phone}` : "", key: "phone" as const },
    { label: "Email", value: userEmail },
  ];

  const handleSaveField = async (key: string) => {
      const updates: Partial<ProfileData> = {};
      if (key === "nom_complet") {
        if (editValues.last_name !== undefined) updates.last_name = editValues.last_name;
        if (editValues.first_name !== undefined) updates.first_name = editValues.first_name;
      } else {
        const val = editValues[key as keyof ProfileData];
        if (val !== undefined) (updates as any)[key] = val;
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from("profiles").update(updates as any).eq("id", userId);
      setProfile(prev => ({ ...prev, ...updates }));
    }
    setEditingField(null);
    setEditValues({});
  };

  const procurationData = generateProcurationData(profile, dossierRef, userEmail);

  const triggerSignature = async () => {
    setLoading(true);
    try {
      const documentBase64 = textToPdfBase64(procurationData.pdf);
      const signerPhone = profile.phone ? `${profile.prefixe_telephone}${profile.phone}` : undefined;

      const { data, error } = await supabase.functions.invoke("yousign-signature/create", {
        body: {
          dossierRef,
          documentName: `procuration_${dossierRef}.pdf`,
          documentBase64,
          signerEmail: userEmail,
          signerPhone,
          userId,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSignatureRequestId(data.signatureRequestId);
      setSignerId(data.signerId);
      setIsSandbox(!!data.sandbox);
      setSandboxTestOtpEnabled(!!data.sandboxTestOtpEnabled);
      if (data.sandboxTestOtpEnabled) setOtpValue("123456");
      setStep("otp");

      if (data.sandboxTestOtpEnabled) {
        toast.success("Mode sandbox — Code 123456 pré-rempli");
      } else {
        toast.success(`Code OTP envoyé par ${signerPhone ? "SMS" : "email"}`);
      }
    } catch (err: any) {
      console.error("[YouSign] Create error:", err);
      toast.error(err.message || "Erreur lors du lancement de la signature");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otpValue || otpValue.length < 4) {
      toast.error("Veuillez entrer le code OTP");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("yousign-signature/verify-otp", {
        body: { signatureRequestId, signerId, otp: otpValue },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Calculate expiry (12 months from now)
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + 12);

      // Update dossier
      await supabase
        .from("dossiers")
        .update({
          procuration_signee: true,
          date_signature_procuration: new Date().toISOString(),
          procuration_active: true,
          use_capdemarches: true,
          procuration_expiration: expiryDate.toISOString().split("T")[0],
        } as any)
        .eq("id", dossierId);

      // Notify CAPDEMARCHES
      await supabase.functions.invoke("capdemarches-notify", {
        body: { action: "notify_capdemarches", dossier_id: dossierId },
      });

      toast.success("✅ Procuration signée et transmise à CAPDEMARCHES");
      onOpenChange(false);
      onComplete?.();
    } catch (err: any) {
      console.error("[YouSign] OTP error:", err);
      toast.error(err.message || "Code OTP invalide ou expiré");
    } finally {
      setLoading(false);
    }
  };

  const allChecked = checks.lu && checks.autorise && checks.comprends;
  const inputClass = "w-full bg-background border-[1.5px] border-border rounded-lg px-3 py-2 text-foreground text-sm outline-none focus:border-primary min-h-[44px]";
  const labelClass = "font-syne text-[0.62rem] font-bold tracking-wider uppercase text-muted-foreground mb-1 block";

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val && step !== "otp") {
        onSkip?.();
      }
      onOpenChange(val);
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* SCREEN 1 — Vérification des données */}
        {step === "verify" && (
          <>
            <DialogHeader>
              <DialogTitle className="font-syne text-xl">Vérifiez vos informations</DialogTitle>
            </DialogHeader>

            {profileLoading ? (
              <div className="py-8 text-center text-muted-foreground">Chargement du profil…</div>
            ) : (
              <div className="space-y-3 mt-2">
                {/* Missing fields form */}
                {!allFieldsFilled && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4">
                    <p className="font-syne font-bold text-sm text-amber-600 mb-3">
                      ⚠️ Complétez les champs manquants
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {missingFields.map(f => (
                        <div key={f.key}>
                          <label className={labelClass}>{f.label} *</label>
                          <input
                            className={inputClass}
                            value={draftMissing[f.key] ?? ""}
                            onChange={(e) => setDraftMissing(prev => ({ ...prev, [f.key]: e.target.value }))}
                            placeholder={f.label}
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={async () => {
                        const updates: Partial<ProfileData> = {};
                        missingFields.forEach(f => {
                          const val = draftMissing[f.key];
                          if (val) (updates as any)[f.key] = val;
                        });
                        if (Object.keys(updates).length > 0) {
                          await supabase.from("profiles").update(updates as any).eq("id", userId);
                          setProfile(prev => ({ ...prev, ...updates }));
                          setDraftMissing({});
                          toast.success("Profil mis à jour");
                        }
                      }}
                      disabled={missingFields.some(f => !draftMissing[f.key])}
                      className="mt-3 font-syne font-bold text-xs px-4 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
                    >
                      Sauvegarder
                    </button>
                  </div>
                )}

                {/* Read-only display with edit buttons */}
                {displayFields.map((field, i) => (
                  <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30 border border-border">
                    <div className="flex-1">
                      <span className="text-xs text-muted-foreground block">{field.label}</span>
                      {editingField === (field.key || field.label) ? (
                        <div className="flex gap-2 mt-1">
                          {field.label === "Nom complet" ? (
                            <>
                              <input className={`${inputClass} !min-h-[36px]`} placeholder="NOM" value={editValues.last_name ?? profile.last_name} onChange={e => setEditValues(v => ({ ...v, last_name: e.target.value }))} />
                              <input className={`${inputClass} !min-h-[36px]`} placeholder="Prénom" value={editValues.first_name ?? profile.first_name} onChange={e => setEditValues(v => ({ ...v, first_name: e.target.value }))} />
                            </>
                          ) : (
                            <input
                              className={`${inputClass} !min-h-[36px]`}
                              value={editValues[field.key as keyof ProfileData] ?? profile[field.key as keyof ProfileData] ?? ""}
                              onChange={e => setEditValues(v => ({ ...v, [field.key!]: e.target.value }))}
                            />
                          )}
                          <button onClick={() => handleSaveField(field.label === "Nom complet" ? "nom_complet" : field.key!)} className="text-xs font-bold text-primary px-2">✓</button>
                          <button onClick={() => { setEditingField(null); setEditValues({}); }} className="text-xs text-muted-foreground px-2">✕</button>
                        </div>
                      ) : (
                        <span className="text-sm font-medium text-foreground">
                          {field.value || <span className="text-muted-foreground italic">Non renseigné</span>}
                        </span>
                      )}
                    </div>
                    {editingField !== (field.key || field.label) && field.label !== "Email" && (
                      <button
                        onClick={() => setEditingField(field.key || field.label)}
                        className="text-xs text-primary hover:underline ml-2 shrink-0"
                      >
                        Modifier
                      </button>
                    )}
                  </div>
                ))}

                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mt-4">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Ces informations figureront <strong>exactement telles quelles</strong> dans votre procuration et votre lettre de recours.
                    Toute erreur pourrait invalider votre dossier.
                  </p>
                </div>

                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all mt-2 ${
                    certifie
                      ? "bg-green-500/5 border-green-500/25"
                      : "bg-muted/10 border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={certifie}
                    onChange={(e) => setCertifie(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded accent-green-600"
                  />
                  <span className={`text-sm ${certifie ? "text-green-700 dark:text-green-400 font-medium" : "text-muted-foreground"}`}>
                    Je certifie que les informations ci-dessus sont exactes et conformes à mes documents d'identité officiels.
                  </span>
                </label>

                <button
                  onClick={() => setStep("consent")}
                  disabled={!allFieldsFilled || !certifie}
                  className="w-full font-syne font-bold text-sm px-5 py-3 rounded-xl bg-primary text-primary-foreground disabled:opacity-50 mt-2"
                >
                  Continuer → Voir la procuration
                </button>
              </div>
            )}
          </>
        )}

        {/* SCREEN 2 — Lecture et consentement */}
        {step === "consent" && (
          <>
            <DialogHeader>
              <DialogTitle className="font-syne text-xl">Procuration CAPDEMARCHES</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              {/* Toggle tabs */}
              <div className="flex gap-1 bg-muted/30 rounded-lg p-1">
                <button
                  onClick={() => setPreviewMode("text")}
                  className={`flex-1 font-syne font-bold text-xs px-3 py-2 rounded-md transition-all ${
                    previewMode === "text"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  📝 Texte
                </button>
                <button
                  onClick={() => setPreviewMode("pdf")}
                  className={`flex-1 font-syne font-bold text-xs px-3 py-2 rounded-md transition-all ${
                    previewMode === "pdf"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  📄 Aperçu PDF
                </button>
              </div>

              {/* Text or PDF preview */}
              {previewMode === "text" ? (
                <div className="bg-muted/20 border border-border rounded-xl p-5 max-h-[40vh] overflow-y-auto">
                  <pre className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-sans">
                    {procurationData.display}
                  </pre>
                </div>
              ) : (
                <div className="border border-border rounded-xl overflow-auto bg-muted/30 flex justify-center p-4" style={{ maxHeight: "45vh" }}>
                  <div
                    className="bg-white text-black rounded shadow-lg"
                    style={{
                      width: "595px",
                      minHeight: "842px",
                      padding: "50px",
                      fontFamily: "Helvetica, Arial, sans-serif",
                      fontSize: "11px",
                      lineHeight: "1.6",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {procurationData.display}
                  </div>
                </div>
              )}

              {/* 3 checkboxes */}
              <div className="space-y-2">
                {[
                  { key: "lu" as const, label: "J'ai lu et compris l'intégralité de la procuration" },
                  { key: "autorise" as const, label: "J'autorise CAPDEMARCHES à réceptionner mon courrier officiel à Paris et à me le transmettre sous 24 heures" },
                  { key: "comprends" as const, label: "Je comprends que cette procuration ne vaut pas représentation juridique" },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      checks[key]
                        ? "bg-green-500/5 border-green-500/25"
                        : "bg-muted/10 border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checks[key]}
                      onChange={(e) => setChecks(prev => ({ ...prev, [key]: e.target.checked }))}
                      className="mt-0.5 w-4 h-4 rounded accent-green-600"
                    />
                    <span className={`text-sm ${checks[key] ? "text-green-700 dark:text-green-400 font-medium" : "text-muted-foreground"}`}>
                      {label}
                    </span>
                  </label>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep("verify")}
                  className="font-syne font-bold text-xs px-4 py-2.5 rounded-lg bg-muted text-muted-foreground border border-border"
                >
                  ← Modifier
                </button>
                <button
                  onClick={triggerSignature}
                  disabled={!allChecked || loading}
                  className="flex-1 font-syne font-bold text-sm px-5 py-2.5 rounded-lg bg-green-600 text-white disabled:opacity-50"
                >
                  {loading ? "⏳ Envoi en cours…" : "✍️ Signer via YouSign — OTP SMS"}
                </button>
              </div>
            </div>
          </>
        )}

        {/* SCREEN 3 — OTP verification */}
        {step === "otp" && (
          <>
            <DialogHeader>
              <DialogTitle className="font-syne text-xl">Vérification OTP</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              {sandboxTestOtpEnabled ? (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-400">
                  🧪 Mode Sandbox — Le code <strong>123456</strong> est pré-rempli.
                </div>
              ) : (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm text-muted-foreground">
                  📱 Un code OTP à 6 chiffres a été envoyé {isSandbox || !profile.phone ? `à ${userEmail}` : `par SMS au ${profile.prefixe_telephone} ${profile.phone}`}.
                </div>
              )}

              <div>
                <label className={labelClass}>Code OTP</label>
                <input
                  className={`${inputClass} text-center text-2xl tracking-[0.5em] font-mono min-h-[56px]`}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  autoFocus
                  autoComplete="one-time-code"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Le code expire dans 5 minutes.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setOtpValue(""); setStep("consent"); }}
                  className="font-syne font-bold text-xs px-4 py-2.5 rounded-lg bg-muted text-muted-foreground border border-border"
                >
                  ← Retour
                </button>
                <button
                  onClick={verifyOtp}
                  disabled={loading || otpValue.length < 4}
                  className="flex-1 font-syne font-bold text-sm px-5 py-2.5 rounded-lg bg-green-600 text-white disabled:opacity-50"
                >
                  {loading ? "⏳ Vérification…" : "✅ Valider la signature"}
                </button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
