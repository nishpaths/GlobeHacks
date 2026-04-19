export interface AuthClaims {
    sub?: string;
    role?: string;
    email?: string;
  }
  
  function decodeBase64Url(value: string): string {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    return atob(`${normalized}${padding}`);
  }
  
  export function extractBearerToken(authorization: string | null): string | null {
    if (!authorization) {
      return null;
    }
  
    const [scheme, token] = authorization.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      return null;
    }
  
    return token;
  }
  
  export function parseJwtClaims(authorization: string | null): AuthClaims | null {
    const token = extractBearerToken(authorization);
    if (!token) {
      return null;
    }
  
    const parts = token.split(".");
    if (parts.length < 2) {
      return null;
    }
  
    try {
      return JSON.parse(decodeBase64Url(parts[1])) as AuthClaims;
    } catch {
      return null;
    }
  }