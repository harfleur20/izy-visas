import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const CGU = () => (
  <div className="min-h-screen bg-background text-foreground">
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
        <ArrowLeft className="w-4 h-4" /> Retour à l'accueil
      </Link>

      <h1 className="font-syne font-extrabold text-3xl mb-2">
        Conditions Générales d'Utilisation & Politique de Confidentialité
      </h1>
      <p className="text-muted-foreground text-sm mb-10">Dernière mise à jour : 7 avril 2026</p>

      {/* Éditeur */}
      <Section title="1. Éditeur de la plateforme">
        <p>
          La plateforme <strong>IZY Visa</strong> est éditée par la société IZY Visa,
          dont le siège social est situé à [adresse à compléter].
        </p>
        <p>Contact : <a href="mailto:contact@izy-visa.com" className="text-primary hover:underline">contact@izy-visa.com</a></p>
      </Section>

      {/* Nature du service */}
      <Section title="2. Nature du service">
        <p>
          IZY Visa est un <strong>outil numérique d'aide à la rédaction</strong> de recours
          gracieux et hiérarchiques contre les refus de visa. La plateforme ne se substitue
          en aucun cas à un avocat, et ne fournit aucun conseil juridique personnalisé.
        </p>
        <p>
          L'utilisation de la plateforme ne crée aucune relation client-avocat.
          Les modèles de courriers générés sont des documents types nécessitant une
          vérification individuelle. L'utilisateur reste seul responsable de la
          décision d'envoyer ou non le recours.
        </p>
      </Section>

      {/* Responsable de traitement */}
      <Section title="3. Responsable de traitement des données">
        <p>
          Le responsable de traitement est la société IZY Visa, joignable à l'adresse :
          <a href="mailto:dpo@izy-visa.com" className="text-primary hover:underline ml-1">dpo@izy-visa.com</a>.
        </p>
        <p>
          Le traitement des données est effectué conformément au Règlement Général sur la
          Protection des Données (RGPD – Règlement UE 2016/679).
        </p>
      </Section>

      {/* Données collectées */}
      <Section title="4. Données collectées et finalités">
        <table className="w-full text-sm border border-border rounded-lg overflow-hidden mt-2">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Donnée</th>
              <th className="text-left px-4 py-2 font-semibold">Finalité</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <Row d="Nom, prénom" f="Identification de l'utilisateur et rédaction du recours" />
            <Row d="Adresse e-mail" f="Création de compte, notifications et correspondance" />
            <Row d="Numéro de téléphone (WhatsApp)" f="Communication et suivi du dossier" />
            <Row d="Type de visa et motif de refus" f="Qualification du dossier et génération du recours" />
            <Row d="Pièces justificatives" f="Constitution du dossier de recours" />
            <Row d="Adresse du destinataire" f="Envoi de la lettre recommandée (LRAR)" />
            <Row d="Données de paiement" f="Traitement sécurisé via Stripe (IZY Visa ne stocke aucune donnée bancaire)" />
            <Row d="Signature électronique" f="Authentification du recours via YouSign" />
          </tbody>
        </table>
      </Section>

      {/* Durée de conservation */}
      <Section title="5. Durée de conservation des données">
        <ul className="list-disc pl-6 space-y-1 text-sm">
          <li><strong>Données de compte</strong> : conservées pendant toute la durée d'utilisation du service, puis 3 ans après la dernière activité.</li>
          <li><strong>Dossiers et pièces justificatives</strong> : conservés 5 ans à compter de la clôture du dossier (délais de prescription).</li>
          <li><strong>Données de paiement</strong> : conservées conformément aux obligations légales comptables (10 ans).</li>
          <li><strong>Logs de connexion</strong> : conservés 1 an conformément à la réglementation.</li>
        </ul>
      </Section>

      {/* Droits des utilisateurs */}
      <Section title="6. Droits des utilisateurs">
        <p>
          Conformément au RGPD, vous disposez des droits suivants sur vos données personnelles :
        </p>
        <ul className="list-disc pl-6 space-y-1 text-sm mt-2">
          <li><strong>Droit d'accès</strong> : obtenir une copie de toutes vos données personnelles.</li>
          <li><strong>Droit de rectification</strong> : corriger les données inexactes ou incomplètes.</li>
          <li><strong>Droit à l'effacement</strong> : demander la suppression de vos données (« droit à l'oubli »).</li>
          <li><strong>Droit à la portabilité</strong> : recevoir vos données dans un format structuré et lisible.</li>
          <li><strong>Droit d'opposition</strong> : vous opposer au traitement de vos données.</li>
          <li><strong>Droit à la limitation</strong> : restreindre le traitement dans certains cas.</li>
        </ul>
        <p className="mt-3">
          Pour exercer ces droits, contactez-nous à :
          <a href="mailto:dpo@izy-visa.com" className="text-primary hover:underline ml-1">dpo@izy-visa.com</a>.
          Nous répondrons dans un délai de 30 jours.
        </p>
        <p className="mt-2">
          Vous pouvez également introduire une réclamation auprès de la
          <strong> CNIL</strong> (Commission Nationale de l'Informatique et des Libertés).
        </p>
      </Section>

      {/* Sécurité */}
      <Section title="7. Sécurité des données">
        <ul className="list-disc pl-6 space-y-1 text-sm">
          <li>Chiffrement des données en transit (TLS/HTTPS) et au repos.</li>
          <li>Authentification sécurisée avec vérification de mots de passe compromis (HIBP).</li>
          <li>Isolation des données par utilisateur via des politiques de sécurité au niveau de la base de données (RLS).</li>
          <li>Clés API tierces stockées côté serveur uniquement, jamais exposées côté client.</li>
          <li>Hébergement sur infrastructure cloud conforme au RGPD.</li>
        </ul>
      </Section>

      {/* Sous-traitants */}
      <Section title="8. Sous-traitants et services tiers">
        <ul className="list-disc pl-6 space-y-1 text-sm">
          <li><strong>Stripe</strong> – Traitement des paiements par carte bancaire.</li>
          <li><strong>MySendingBox</strong> – Envoi de lettres recommandées avec accusé de réception (LRAR).</li>
          <li><strong>YouSign</strong> – Signature électronique qualifiée.</li>
        </ul>
        <p className="mt-2 text-sm">
          Chaque sous-traitant est soumis à des obligations contractuelles de protection des données conformes au RGPD.
        </p>
      </Section>

      {/* Cookies */}
      <Section title="9. Cookies">
        <p>
          IZY Visa utilise uniquement des cookies strictement nécessaires au fonctionnement
          du service (authentification, session). Aucun cookie publicitaire ou de suivi n'est utilisé.
        </p>
      </Section>

      {/* Modification */}
      <Section title="10. Modification des présentes conditions">
        <p>
          IZY Visa se réserve le droit de modifier les présentes CGU et politique de confidentialité
          à tout moment. Les utilisateurs seront informés par e-mail de toute modification substantielle.
          La date de dernière mise à jour figure en haut de cette page.
        </p>
      </Section>

      <div className="border-t border-border pt-6 mt-12 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} IZY Visa — Tous droits réservés
      </div>
    </div>
  </div>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-8">
    <h2 className="font-syne font-bold text-lg mb-3">{title}</h2>
    <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">{children}</div>
  </section>
);

const Row = ({ d, f }: { d: string; f: string }) => (
  <tr>
    <td className="px-4 py-2">{d}</td>
    <td className="px-4 py-2 text-muted-foreground">{f}</td>
  </tr>
);

export default CGU;
