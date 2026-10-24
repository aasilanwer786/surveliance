import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { get, post, tokens } from "./api";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: string;
  status: string;
  mustChangePassword?: boolean;
  permissions: string[];
  guard?: { employeeCode?: string; gate?: { id: string; name: string } | null } | null;
  apartments?: Array<{
    residentId: string;
    apartmentId: string;
    flatNumber: string;
    floor: number;
    block: string;
    building: string;
    relation?: string;
    isPrimary?: boolean;
  }>;
}

interface AuthCtx {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  has: (perm: string | string[]) => boolean;
  refreshUser: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!tokens.access && !tokens.refresh) {
      setUser(null);
      return;
    }
    try {
      const profile = await get<UserProfile>("/api/auth/me");
      setUser(profile);
    } catch {
      tokens.clear();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refreshUser();
      setLoading(false);
    })();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await post<{ accessToken: string; refreshToken: string; user: UserProfile }>(
      "/api/auth/login",
      { email, password },
    );
    tokens.set(res.accessToken, res.refreshToken);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await post("/api/auth/logout");
    } catch {
      // ignore — we clear local state regardless
    }
    tokens.clear();
    setUser(null);
  }, []);

  const has = useCallback(
    (perm: string | string[]) => {
      if (!user) return false;
      const list = Array.isArray(perm) ? perm : [perm];
      return list.some((p) => user.permissions?.includes(p));
    },
    [user],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!user) throw new Error("Not signed in");
      await post("/api/auth/change-password", { currentPassword, newPassword });
      // the server revokes every refresh token — sign in again for a fresh pair
      const res = await post<{ accessToken: string; refreshToken: string; user: UserProfile }>("/api/auth/login", {
        email: user.email,
        password: newPassword,
      });
      tokens.set(res.accessToken, res.refreshToken);
      setUser(res.user);
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, has, refreshUser, changePassword }),
    [user, loading, login, logout, has, refreshUser, changePassword],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function roleName(role?: string): string {
  return (role ?? "").toLowerCase().replace(/_/g, " ");
}
