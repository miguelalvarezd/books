"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { send } from "@/lib/api";
import { useI18n, type MessageKey } from "@/lib/i18n";

export default function AccountPage() {
  const { me, refresh, signOut } = useAuth();
  const { t } = useI18n();
  const [name, setName] = useState(me.user?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!me.user)
    return (
      <main className="page">
        <h1 className="title">{t("account")}</h1>
        <p className="muted">AUTH_MODE=off</p>
      </main>
    );

  return (
    <main className="page">
      <h1 className="title">{t("account")}</h1>
      <p>
        {t("signedInAs", { name: me.user.name })} · {t(me.user.role === "admin" ? "admin" : "member")}
        {me.user.email && (
          <>
            <br />
            <span className="muted">{me.user.email}</span>
          </>
        )}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await send(`/api/users/${me.user!.id}`, "PATCH", { name });
          setBusy(false);
          const reason = (r.data as { reason?: string } | null)?.reason;
          setMsg(r.ok ? null : reason ? t(`err_${reason}` as MessageKey) : t("failed"));
          if (r.ok) await refresh();
        }}
      >
        <label className="field">
          <span>{t("yourName")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="words" />
        </label>
        {msg && (
          <p className="error" role="alert">
            {msg}
          </p>
        )}
        <button className="btn btn-block" disabled={busy || !name.trim() || name === me.user.name}>
          {busy ? t("saving") : t("save")}
        </button>
      </form>
      <Link href="/family" className="btn btn-block btn-link">
        {t("family")}
      </Link>

      <h2 className="h2">{t("exportTitle")}</h2>
      <p className="muted">{t("exportIntro")}</p>
      <a className="btn btn-block btn-link" href="/api/export/books" download>
        {t("exportBooks")}
      </a>
      <a className="btn btn-block btn-link" href="/api/export/loans" download>
        {t("exportLoans")}
      </a>
      {me.user.role === "admin" && (
        <>
          <a className="btn btn-block btn-link" href="/api/export/backup" download>
            {t("exportBackup")}
          </a>
          <p className="muted small">{t("exportBackupHint")}</p>
        </>
      )}

      <button className="btn btn-danger btn-block" onClick={() => void signOut()}>
        {t("signOut")}
      </button>
    </main>
  );
}
