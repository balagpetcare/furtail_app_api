export interface AuthenticatedPrincipal {
  sub: string;
  issuer: string;
  audience: string | string[];
  clientId: string;
  expiresAt: number;
  issuedAt: number;
  roles: string[];
  permissions: string[];
  scopes: string[];
  email?: string;
  name?: string;
  claims: Record<string, unknown>;
}

export interface TokenVerifier {
  verifyAccessToken(token: string): Promise<AuthenticatedPrincipal>;
}
