// Rejects requests that do not carry a valid *user* access token. The gateway's verify_jwt
// only checks the signature, so it also lets the public anon key through; this check verifies
// the token against the project's signing keys and requires a signed-in user's claims (D-053).
import { errorResponse, handleOptions } from './cors.ts';

export type AuthUser = { id: string };
export type UserVerifier = (token: string) => Promise<AuthUser | null>;

/** The claims of an access token this check reads. */
type TokenClaims = { sub?: string; role?: string };

/** The part of Supabase Auth the verifier uses (the Supabase client, or a fake in tests). */
export type ClaimsClient = {
  auth: {
    getClaims(jwt: string): Promise<{ data: { claims: TokenClaims } | null; error: unknown }>;
  };
};

/**
 * Verifies a user's access token locally against the project's JWT signing keys (JWKS, cached
 * by the client): no Auth round trip per request, which was ~14 ms of a ~30 ms checklist call
 * locally. Projects still on the legacy shared secret are checked by Auth, as before. The anon
 * and service keys carry no signed-in user (`role` is not `authenticated`), so they fail.
 * @example const user = await supabaseUserVerifier(serviceClient())(token); // { id } | null
 */
export function supabaseUserVerifier(client: ClaimsClient): UserVerifier {
  return async (token) => {
    const { data, error } = await client.auth.getClaims(token);
    const claims = data?.claims;
    if (error || claims?.role !== 'authenticated' || !claims.sub) return null;
    return { id: claims.sub };
  };
}

export function bearerToken(req: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get('Authorization') ?? '');
  return match ? match[1]! : null;
}

export function requireUser(
  verify: UserVerifier,
  handler: (req: Request, user: AuthUser) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    const preflight = handleOptions(req);
    if (preflight) return preflight;
    const token = bearerToken(req);
    if (!token) return errorResponse(401, 'unauthorized', 'missing bearer token');
    let user: AuthUser | null = null;
    try {
      user = await verify(token);
    } catch (err) {
      console.warn('auth verification failed:', err);
    }
    if (!user) return errorResponse(401, 'unauthorized', 'invalid or expired user token');
    return handler(req, user);
  };
}
