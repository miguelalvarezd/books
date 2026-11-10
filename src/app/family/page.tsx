"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Modal } from "@/components/Modal";
import { send } from "@/lib/api";
import { useI18n, type MessageKey } from "@/lib/i18n";

interface Person {
  id: number;
  name: string;
  email: string | null;
  role: "admin" | "member";
  active: number;
}

export default function FamilyPage() {
  const { me, refresh: refreshMe } = useAuth();
  const { t } = useI18n();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [editing, setEditing] = useState<Person | "new" | null>(null);
  const isAdmin = me.user?.role === "admin" || me.mode === "off";
  const canAdd = isAdmin || me.mode === "passcode";

  const load = useCallback(async () => {
    const res = await fetch("/api/users", { cache: "no-store" });
    setPeople(res.ok ? await res.json() : []);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    void load();
  }, [load]);

  return (
    <main className="page">
      <h1 className="title">{t("family")}</h1>
      <p className="muted">{t("familyIntro")}</p>
      {canAdd && (
        <button className="btn btn-block" onClick={() => setEditing("new")}>
          + {t("addPerson")}
        </button>
      )}
      <ul className="list">
        {(people ?? []).map((p) => (
          <li key={p.id} className="edit-row">
            <div className="edit-row-text">
              <span className="edit-row-title">
                {p.name}
                {p.id === me.user?.id && ` (${t("you")})`}
              </span>
              <span className="row-sub">
                {[t(p.role === "admin" ? "admin" : "member"), p.email, p.active ? null : t("inactive")].filter(Boolean).join(" · ")}
              </span>
            </div>
            {isAdmin && (
              <button className="btn btn-small" onClick={() => setEditing(p)} aria-label={`${t("edit")}: ${p.name}`}>
                {t("edit")}
              </button>
            )}
          </li>
        ))}
      </ul>
      {editing && (
        <PersonDialog
          person={editing === "new" ? null : editing}
          needsEmail={me.mode === "accounts"}
          isAdmin={isAdmin}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
            await refreshMe();
          }}
        />
      )}
    </main>
  );
}

function PersonDialog({
  person,
  needsEmail,
  isAdmin,
  onClose,
  onSaved,
}: {
  person: Person | null;
  needsEmail: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(person?.name ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [role, setRole] = useState(person?.role ?? "member");
  const [active, setActive] = useState(person ? person.active === 1 : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal title={person ? t("editPerson") : t("addPerson")} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const r = person
            ? await send(`/api/users/${person.id}`, "PATCH", { name, email, role, active })
            : await send("/api/users", "POST", { name, email });
          setBusy(false);
          if (!r.ok) {
            const reason = (r.data as { reason?: string } | null)?.reason;
            return setError(reason ? t(`err_${reason}` as MessageKey) : t("failed"));
          }
          await onSaved();
        }}
      >
        <label className="field">
          <span>{t("name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="words" />
        </label>
        {(needsEmail || isAdmin) && (
          <label className="field">
            <span>
              {t("email")}
              {!needsEmail && <small className="muted"> ({t("optional")})</small>}
            </span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" />
          </label>
        )}
        {person && isAdmin && (
          <>
            <label className="field">
              <span>{t("role")}</span>
              <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "member")}>
                <option value="member">{t("member")}</option>
                <option value="admin">{t("admin")}</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              <span>{t("active")}</span>
            </label>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-buttons">
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? t("saving") : t("save")}
          </button>
          <button type="button" className="btn btn-quiet" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
