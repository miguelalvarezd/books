"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Login } from "./Login";
import { useI18n } from "@/lib/i18n";

export interface Me {
  mode: "accounts" | "passcode" | "off";
  user: { id: number; name: string; email: string | null; role: "admin" | "member" } | null;
  methods: { passcode: boolean; google: boolean; email: boolean };
}

interface AuthState {
  me: Me;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

/** Shows the sign-in screen until this phone has a session; then the app. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setMe(await res.json());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    await refresh();
  }, [refresh]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    void refresh();
  }, [refresh]);

  if (!me)
    return (
      <main className="page center" aria-live="polite">
        {failed ? (
          <>
            <p>{t("error")}</p>
            <button className="btn" onClick={() => void refresh()}>
              {t("retry")}
            </button>
          </>
        ) : (
          <p>{t("loading")}</p>
        )}
      </main>
    );
  if (!me.user && me.mode !== "off") return <Login me={me} onSignedIn={refresh} />;
  return <Ctx.Provider value={{ me, refresh, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
