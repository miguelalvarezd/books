"use client";
import { useEffect, useState } from "react";
import type { Me } from "./AuthProvider";
import { send } from "@/lib/api";
import { useI18n, type MessageKey } from "@/lib/i18n";

/** Sign-in screen: family code + name (passcode mode) or Google / email link (accounts mode). */
export function Login({ me, onSignedIn }: { me: Me; onSignedIn: () => Promise<void> }) {
  const { t, locale, setLocale } = useI18n();
  const [notice, setNotice] = useState<string | null>(null);

  // Errors coming back from Google or an email link: /?login=not_invited
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("login");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the URL
    if (reason) setNotice(t(`login_${reason}` as MessageKey));
    if (reason) window.history.replaceState(null, "", window.location.pathname);
  }, [t]);

  const errText = (data: unknown) => {
    const reason = (data as { reason?: string } | null)?.reason;
    return reason ? t(`err_${reason}` as MessageKey) : t("failed");
  };

  const none = !me.methods.passcode && !me.methods.google && !me.methods.email;

  return (
    <main className="page login">
      <div className="login-top">
        <button
          className="lang"
          onClick={() => setLocale(locale === "es" ? "en" : "es")}
          aria-label={t("switchLanguage")}
          lang={locale === "es" ? "en" : "es"}
        >
          {t("switchShort")}
        </button>
      </div>
      <h1 className="title">{t("signInTitle")}</h1>
      <p className="muted">{t("signInIntro")}</p>
      {notice && (
        <p className="error" role="alert">
          {notice}
        </p>
      )}
      {none && <p className="error">{t("err_not_configured")}</p>}
      {me.methods.passcode && <PasscodeLogin errText={errText} onSignedIn={onSignedIn} />}
      {me.methods.google && (
        <a className="btn btn-primary btn-block" href="/api/auth/google">
          {t("withGoogle")}
        </a>
      )}
      {me.methods.google && me.methods.email && <p className="or">{t("or")}</p>}
      {me.methods.email && <EmailLogin errText={errText} locale={locale} />}
    </main>
  );
}

function PasscodeLogin({ errText, onSignedIn }: { errText: (d: unknown) => string; onSignedIn: () => Promise<void> }) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [users, setUsers] = useState<{ id: number; name: string }[] | null>(null);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    const r = await send("/api/auth/passcode", "POST", { code, ...body });
    setBusy(false);
    if (!r.ok) return setError(errText(r.data));
    await onSignedIn();
  };

  if (!users)
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const r = await send<{ users: { id: number; name: string }[] }>("/api/auth/passcode/check", "POST", { code });
          setBusy(false);
          if (!r.ok) return setError(errText(r.data));
          setUsers(r.data!.users);
          setAdding(r.data!.users.length === 0);
        }}
      >
        <label className="field">
          <span>{t("familyCode")}</span>
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="current-password"
            autoCapitalize="off"
            autoFocus
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary btn-block" disabled={busy || !code.trim()}>
          {busy ? t("saving") : t("continue")}
        </button>
      </form>
    );

  return (
    <section aria-labelledby="who">
      <h2 id="who" className="h2">
        {t("whoAreYou")}
      </h2>
      <div className="people">
        {users.map((u) => (
          <button key={u.id} className="btn" disabled={busy} onClick={() => void signIn({ userId: u.id })}>
            {u.name}
          </button>
        ))}
        {!adding && (
          <button className="btn btn-quiet" onClick={() => setAdding(true)}>
            + {t("imNew")}
          </button>
        )}
      </div>
      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void signIn({ newName });
          }}
        >
          <label className="field">
            <span>{t("yourName")}</span>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} autoCapitalize="words" autoFocus />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy || !newName.trim()}>
            {busy ? t("saving") : t("signIn")}
          </button>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function EmailLogin({ errText, locale }: { errText: (d: unknown) => string; locale: string }) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (sent)
    return (
      <p className="hint" role="status">
        {t("checkEmail")}
      </p>
    );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const r = await send("/api/auth/email", "POST", { email, locale });
        setBusy(false);
        if (!r.ok) return setError(errText(r.data));
        setSent(true);
      }}
    >
      <label className="field">
        <span>{t("yourEmail")}</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-block" disabled={busy || !email.includes("@")}>
        {busy ? t("saving") : t("sendLink")}
      </button>
    </form>
  );
}
