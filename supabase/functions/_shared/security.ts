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

const textEncoder = new TextEncoder();

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

export function requireSharedWebhookSecret(req: Request, envName: string) {
  const expectedSecret = Deno.env.get(envName);
  if (!expectedSecret) {
    throw new HttpError(500, `${envName} not configured`);
  }

  const authorization = req.headers.get("Authorization")?.trim();
  const headerSecret = req.headers.get("x-webhook-secret")?.trim();
  const url = new URL(req.url);
  const querySecret =
    url.searchParams.get("webhook_secret") ||
    url.searchParams.get("secret") ||
    url.searchParams.get("token");

  const providedSecret = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : headerSecret || querySecret || "";

  if (!timingSafeEqual(providedSecret, expectedSecret)) {
    throw new HttpError(401, "Unauthorized webhook");
  }
}

export async function requireYousignWebhookSignature(req: Request, rawBody: string) {
  const webhookSecret = Deno.env.get("YOUSIGN_WEBHOOK_SECRET");
  if (!webhookSecret) {
    throw new HttpError(500, "YOUSIGN_WEBHOOK_SECRET not configured");
  }

  const signature = req.headers.get("x-yousign-signature-256")?.trim() || "";
  const digest = await hmacSha256Hex(webhookSecret, rawBody);
  const expectedSignature = `sha256=${digest}`;

  if (!timingSafeEqual(signature, expectedSignature)) {
    throw new HttpError(401, "Invalid YouSign webhook signature");
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = textEncoder.encode(a);
  const bBytes = textEncoder.encode(b);
  let diff = aBytes.length ^ bBytes.length;
  const maxLength = Math.max(aBytes.length, bBytes.length);

  for (let i = 0; i < maxLength; i++) {
    diff |= (aBytes[i] || 0) ^ (bBytes[i] || 0);
  }

  return diff === 0;
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(payload));
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
