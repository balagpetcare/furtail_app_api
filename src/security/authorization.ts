import type { AuthenticatedPrincipal } from './principal';

export function normalizeValues(values: readonly string[] = []): string[] {
  return values
    .map((value) => value.trim())
    .filter(
      (value, index, array) =>
        value.length > 0 &&
        array.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index,
    );
}

export function hasRole(
  principal: AuthenticatedPrincipal | undefined,
  ...roles: string[]
): boolean {
  if (!principal) return false;
  const allowed = new Set(principal.roles.map((role) => role.toLowerCase()));
  return roles.some((role) => allowed.has(role.toLowerCase()));
}

export function hasPermission(
  principal: AuthenticatedPrincipal | undefined,
  ...permissions: string[]
): boolean {
  if (!principal) return false;
  const allowed = new Set(principal.permissions.map((permission) => permission.toLowerCase()));
  return permissions.some((permission) => allowed.has(permission.toLowerCase()));
}

export function isOwner(
  principal: AuthenticatedPrincipal | undefined,
  ownerId: string | number | bigint | null | undefined,
): boolean {
  if (!principal || ownerId === null || ownerId === undefined) return false;
  return String(principal.sub) === String(ownerId);
}

export function collectScopes(scope: unknown): string[] {
  if (Array.isArray(scope)) {
    return normalizeValues(scope.filter((value): value is string => typeof value === 'string'));
  }
  if (typeof scope === 'string') {
    return normalizeValues(scope.split(/\s+/));
  }
  return [];
}

export function collectRoleValues(input: unknown): string[] {
  if (Array.isArray(input)) {
    return normalizeValues(input.filter((value): value is string => typeof value === 'string'));
  }
  if (typeof input === 'string') {
    return normalizeValues(input.split(/[,\s]+/));
  }
  return [];
}
