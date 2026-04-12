export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const PRIVILEGED_ROLES = new Set([
  "admin",
  "admin_delegue",
  "admin_juridique",
  "super_admin",
]);

export type AuthenticatedContext = {
  authHeader: string;
  user: { id: string; email?: string | null };
  roles: string[];
  isPrivileged: boolean;
};

type UserClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; email?: string | null } | null };
      error: unknown;
    }>;
  };
};

type RoleClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{
        data: Array<{ role?: string | null }> | null;
        error: unknown;
      }>;
    };
  };
};

export async function requireAuthenticatedContext(
  req: Request,
  supabaseAdmin: unknown,
  supabaseUser: unknown,
): Promise<AuthenticatedContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new HttpError(401, "Non autorise");
  }

  const userClient = supabaseUser as UserClient;
  const roleClient = supabaseAdmin as RoleClient;

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    throw new HttpError(401, "Non authentifie");
  }

  const { data: roleRows, error: roleError } = await roleClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (roleError) {
    throw new HttpError(500, "Impossible de charger les roles utilisateur");
  }

  const roles = (roleRows || [])
    .map((row: { role?: string | null }) => row.role)
    .filter((role: string | null | undefined): role is string => Boolean(role));

  return {
    authHeader,
    user: { id: user.id, email: user.email },
    roles,
    isPrivileged: roles.some((role) => PRIVILEGED_ROLES.has(role)),
  };
}

export function assertDossierAccess(
  context: AuthenticatedContext,
  dossier: { user_id?: string | null } | null,
) {
  if (!dossier) {
    throw new HttpError(404, "Dossier introuvable");
  }

  if (context.isPrivileged) {
    return;
  }

  if (!dossier.user_id || dossier.user_id !== context.user.id) {
    throw new HttpError(403, "Acces refuse a ce dossier");
  }
}
