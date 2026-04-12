import { useState } from "react";
import ShellLayout from "@/components/ShellLayout";
import { NavItem, NavGroup } from "@/components/NavItem";
import { AdminReferencesJuridiques } from "@/components/AdminReferencesJuridiques";
import { AdminPiecesRequises } from "@/components/AdminPiecesRequises";

const AdminJuridiqueSpace = () => {
  const [page, setPage] = useState(0);

  const sidebar = (
    <>
      <NavGroup label="Base juridique">
        <NavItem icon="⚖️" label="Références juridiques" active={page === 0} onClick={() => setPage(0)} />
        <NavItem icon="📎" label="Pièces requises" active={page === 1} onClick={() => setPage(1)} />
      </NavGroup>
    </>
  );

  return (
    <ShellLayout
      role="admin"
      roleLabel="Admin Juridique"
      sidebar={sidebar}
      topbarTitle={["Références juridiques", "Pièces requises"][page]}
      topbarRight={<div className="w-[30px] h-[30px] rounded-md bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center font-syne font-extrabold text-[0.68rem] text-white">AJ</div>}
      footerContent={<><strong className="text-muted-foreground">Admin Juridique IZY</strong></>}
    >
      <div className="animate-fadeU">
        {page === 0 && <AdminReferencesJuridiques />}
        {page === 1 && <AdminPiecesRequises />}
      </div>
    </ShellLayout>
  );
};

export default AdminJuridiqueSpace;
