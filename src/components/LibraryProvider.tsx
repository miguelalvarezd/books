"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { buildIndex, type LibraryIndex } from "@/lib/library";
import { useI18n } from "@/lib/i18n";
import type { LibraryData } from "@/lib/types";

interface LibraryState {
  ix: LibraryIndex | null;
  reload: () => Promise<void>;
}

const Ctx = createContext<LibraryState | null>(null);

/** Loads the whole catalog once; every page reads from memory, so lookups are instant. */
export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [data, setData] = useState<LibraryData | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/library", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void reload();
  }, [reload]);

  const ix = useMemo(() => (data ? buildIndex(data) : null), [data]);

  if (!ix) {
    return (
      <main className="page center" aria-live="polite">
        {failed ? (
          <>
            <p>{t("error")}</p>
            <button className="btn" onClick={() => void reload()}>
              {t("retry")}
            </button>
          </>
        ) : (
          <p>{t("loading")}</p>
        )}
      </main>
    );
  }
  return <Ctx.Provider value={{ ix, reload }}>{children}</Ctx.Provider>;
}

export function useLibrary(): LibraryState & { ix: LibraryIndex } {
  const v = useContext(Ctx);
  if (!v?.ix) throw new Error("useLibrary outside LibraryProvider");
  return v as LibraryState & { ix: LibraryIndex };
}
