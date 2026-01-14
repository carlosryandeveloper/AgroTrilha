import React, { useEffect, useMemo, useState } from "react";

type Template = { id: number; name: string; description: string };
type User = { id: number; name: string; email: string };

const API_BASE = "/api"; // proxy do Vite -> backend

export default function App() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [actorUserId, setActorUserId] = useState<number | null>(null);

  const [clientName, setClientName] = useState("");
  const [templateId, setTemplateId] = useState<number | null>(null);

  const [result, setResult] = useState<any>(null);
  const [apiOk, setApiOk] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const actorHeader = useMemo(
    () => (actorUserId ? { "X-User-Id": String(actorUserId) } : {}),
    [actorUserId]
  );

  async function safeFetchJSON(url: string, init?: RequestInit) {
    try {
      setError("");
      const res = await fetch(url, init);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);
      }
      setApiOk(true);
      return await res.json();
    } catch (e: any) {
      setApiOk(false);
      setError(e?.message || "Falha ao acessar a API.");
      throw e;
    }
  }

  async function loadTemplates() {
    const data = await safeFetchJSON(`${API_BASE}/templates`);
    setTemplates(data);
    if (data?.length && templateId == null) setTemplateId(data[0].id);
  }

  async function loadUsers() {
    const data = await safeFetchJSON(`${API_BASE}/users`);
    setUsers(data);
    if (data?.length && actorUserId == null) setActorUserId(data[0].id);
  }

  async function createProject() {
    if (!templateId) return;
    const data = await safeFetchJSON(`${API_BASE}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...actorHeader },
      body: JSON.stringify({
        template_id: templateId,
        client_name: clientName || "Cliente X",
      }),
    });
    setResult(data);
  }

  useEffect(() => {
    // tenta carregar tudo no boot
    loadUsers().catch(() => {});
    loadTemplates().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand">
          <h1 className="h1">ImplantHub</h1>
          <p className="subtitle">
            Templates → Projeto → Checklist automático + Auditoria (quem mexeu).
          </p>
        </div>

        <div className="badge" title="Status da API">
          <span className={apiOk ? "dot ok" : "dot"} />
          <span>{apiOk ? "API online" : "API offline"}</span>
        </div>
      </div>

      <div className="grid">
        <section className="card">
          <h2>Usuário (autor das alterações)</h2>
          <div className="row">
            <button className="button" onClick={() => loadUsers().catch(() => {})}>
              Recarregar usuários
            </button>
          </div>

          <div style={{ marginTop: 10 }}>
            <select
              value={actorUserId ?? ""}
              onChange={(e) =>
                setActorUserId(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">(sem autor)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  #{u.id} — {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>

          <div className="small">
            Dica: crie usuários no Swagger em{" "}
            <span className="mono">/docs</span> usando{" "}
            <span className="mono">POST /users</span>.
          </div>
        </section>

        <section className="card">
          <h2>Templates</h2>
          <div className="row">
            <button className="button" onClick={() => loadTemplates().catch(() => {})}>
              Recarregar templates
            </button>
          </div>

          <ul className="list">
            {templates.map((t) => (
              <li key={t.id}>
                <div className="radio">
                  <input
                    type="radio"
                    name="template"
                    checked={templateId === t.id}
                    onChange={() => setTemplateId(t.id)}
                  />
                  <div>
                    <div style={{ fontWeight: 700 }}>{t.name}</div>
                    <div style={{ color: "var(--muted)", fontSize: 13 }}>
                      {t.description || "—"}
                    </div>
                  </div>
                </div>
              </li>
            ))}
            {!templates.length && (
              <li style={{ justifyContent: "center", color: "var(--muted)" }}>
                Nenhum template ainda (crie pelo Swagger).
              </li>
            )}
          </ul>
        </section>

        <section className="card span-2">
          <h2>Criar projeto</h2>
          <div className="row" style={{ gap: 12 }}>
            <input
              placeholder="Nome do cliente"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
            <button className="button primary" onClick={() => createProject().catch(() => {})}>
              Gerar checklist
            </button>
          </div>

          {error && (
            <div className="alert">
              <strong>Erro:</strong> {error}
              <div className="small" style={{ marginTop: 6 }}>
                Se isso for <span className="mono">ERR_CONNECTION_REFUSED</span>, o backend não subiu.
                Rode <span className="mono">docker compose ps</span> e veja logs com{" "}
                <span className="mono">docker compose logs -f backend</span>.
              </div>
            </div>
          )}

          {result && (
            <pre className="pre">{JSON.stringify(result, null, 2)}</pre>
          )}
        </section>
      </div>
    </div>
  );
}
