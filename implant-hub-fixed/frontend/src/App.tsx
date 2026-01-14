import React, { useEffect, useMemo, useState } from "react";

type User = { id: number; name: string; email: string };
type Template = { id: number; name: string; description: string };
type Project = { id: number; template_id: number; client_name: string; status: string };
type ChecklistItem = {
  id: number;
  project_id: number;
  activity_id: number | null;
  title: string;
  status: string;
  assignee: string;
  notes: string;
};

const API = "/api";

const DEFAULT_TEMPLATE_NAME = "Agrotis • Implantação Base (Auto)";
const DEFAULT_ACTIVITIES = [
  "Configurações iniciais",
  "Status da implantação",
  "Pendências",
  "Responsáveis",
];

function normalize(s: string) {
  return (s || "").trim().toLowerCase();
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "todo", label: "Planejamento" },
  { value: "doing", label: "Em andamento" },
  { value: "blocked", label: "Bloqueado" },
  { value: "done", label: "Concluído" },
];

export default function App() {
  const [view, setView] = useState<"projects" | "users">("projects");

  const [apiOk, setApiOk] = useState(true);
  const [error, setError] = useState("");

  const [users, setUsers] = useState<User[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [actorUserId, setActorUserId] = useState<number | null>(null);

  // Users form
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");

  // Project form
  const [projectTitle, setProjectTitle] = useState("");
  const [projectModule, setProjectModule] = useState<"ERP" | "Armazenagem" | "Produtor Rural">("ERP");
  const [initialConfig, setInitialConfig] = useState("");
  const [implStatus, setImplStatus] = useState<"todo" | "doing" | "blocked" | "done">("todo");
  const [pendencias, setPendencias] = useState("");
  const [responsaveis, setResponsaveis] = useState<number[]>([]);

  const [result, setResult] = useState<any>(null);

  // Checklist viewer/editor
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedProjectName, setSelectedProjectName] = useState<string>("");
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(false);

  // Add item manual
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemStatus, setNewItemStatus] = useState("todo");
  const [newItemAssignee, setNewItemAssignee] = useState("");
  const [newItemNotes, setNewItemNotes] = useState("");

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

  // ------- LOADERS -------
  async function loadUsers() {
    const data = await safeFetchJSON(`${API}/users`);
    setUsers(data);
    if (data?.length && actorUserId == null) setActorUserId(data[0].id);
  }

  async function loadTemplates() {
    const data = await safeFetchJSON(`${API}/templates`);
    setTemplates(data);
  }

  async function loadProjects() {
    const data = await safeFetchJSON(`${API}/projects`);
    setProjects(data);
  }

  // ------- TEMPLATE AUTO -------
  async function ensureDefaultTemplate(): Promise<number> {
    const list: Template[] = await safeFetchJSON(`${API}/templates`);
    setTemplates(list);

    const found = list.find((t) => normalize(t.name) === normalize(DEFAULT_TEMPLATE_NAME));
    if (found) return found.id;

    const payload = {
      name: DEFAULT_TEMPLATE_NAME,
      description: "Template padrão criado automaticamente pela UI",
      phases: [
        {
          name: "Visão Geral",
          order: 1,
          activities: DEFAULT_ACTIVITIES.map((a) => ({
            name: a,
            description: `Seção do projeto: ${a}`,
            definition_of_done: "Atualizado e validado",
          })),
        },
        {
          name: "Execução (exemplo)",
          order: 2,
          activities: [
            {
              name: "Kickoff com o cliente",
              description: "Alinhamento de escopo, prazos e responsáveis",
              definition_of_done: "Ata registrada + próximos passos definidos",
            },
            {
              name: "Validação de acessos e integrações",
              description: "Ambientes, usuários, integrações (se houver)",
              definition_of_done: "Checklist técnico validado",
            },
          ],
        },
      ],
    };

    const created: Template = await safeFetchJSON(`${API}/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...actorHeader },
      body: JSON.stringify(payload),
    });

    await loadTemplates();
    return created.id;
  }

  // ------- USERS: CREATE -------
  async function createUser() {
    if (!newUserName.trim() || !newUserEmail.trim()) {
      setError("Preencha nome e e-mail.");
      return;
    }
    const created = await safeFetchJSON(`${API}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...actorHeader },
      body: JSON.stringify({ name: newUserName.trim(), email: newUserEmail.trim() }),
    });
    setResult(created);
    setNewUserName("");
    setNewUserEmail("");
    await loadUsers();
  }

  // ------- PROJECTS: CREATE -------
  async function createProject() {
    if (!projectTitle.trim()) {
      setError("Dê um nome pro projeto (ex.: ERP, Armazenagem, Produtor Rural).");
      return;
    }

    const templateId = await ensureDefaultTemplate();

    const created = await safeFetchJSON(`${API}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...actorHeader },
      body: JSON.stringify({
        template_id: templateId,
        client_name: `${projectTitle.trim()} • ${projectModule}`,
      }),
    });

    const projectId = created.project_id as number;

    const checklistRes = await safeFetchJSON(`${API}/projects/${projectId}/checklist`);
    const items: ChecklistItem[] = checklistRes.items || [];

    const byTitle = new Map<string, ChecklistItem>();
    for (const it of items) byTitle.set(normalize(it.title), it);

    const configItem = byTitle.get(normalize("Configurações iniciais"));
    const statusItem = byTitle.get(normalize("Status da implantação"));
    const pendItem = byTitle.get(normalize("Pendências"));
    const respItem = byTitle.get(normalize("Responsáveis"));

    const patches: Promise<any>[] = [];

    if (configItem) {
      patches.push(
        safeFetchJSON(`${API}/projects/${projectId}/checklist/${configItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...actorHeader },
          body: JSON.stringify({ notes: initialConfig || "" }),
        })
      );
    }

    if (statusItem) {
      patches.push(
        safeFetchJSON(`${API}/projects/${projectId}/checklist/${statusItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...actorHeader },
          body: JSON.stringify({ status: implStatus }),
        })
      );
    }

    if (pendItem) {
      patches.push(
        safeFetchJSON(`${API}/projects/${projectId}/checklist/${pendItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...actorHeader },
          body: JSON.stringify({ notes: pendencias || "" }),
        })
      );
    }

    if (responsaveis.length) {
      for (const uid of responsaveis) {
        patches.push(
          safeFetchJSON(`${API}/projects/${projectId}/members`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...actorHeader },
            body: JSON.stringify({ user_id: uid, role: "member" }),
          })
        );
      }

      if (respItem) {
        const names = users
          .filter((u) => responsaveis.includes(u.id))
          .map((u) => `${u.name} <${u.email}>`)
          .join("\n");

        patches.push(
          safeFetchJSON(`${API}/projects/${projectId}/checklist/${respItem.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...actorHeader },
            body: JSON.stringify({ notes: names }),
          })
        );
      }
    }

    await Promise.allSettled(patches);

    setResult({
      ...created,
      info: "Projeto criado. Checklist preenchido nas seções básicas.",
    });

    await loadProjects();

    setProjectTitle("");
    setInitialConfig("");
    setPendencias("");
    setResponsaveis([]);
    setImplStatus("todo");

    await openChecklist(projectId);
  }

  // ------- CHECKLIST: OPEN / REFRESH / UPDATE -------
  async function openChecklist(projectId: number) {
    setSelectedProjectId(projectId);
    setChecklistLoading(true);
    try {
      const data = await safeFetchJSON(`${API}/projects/${projectId}/checklist`);
      const proj: Project = data.project;
      const items: ChecklistItem[] = data.items || [];
      setSelectedProjectName(proj?.client_name || `Projeto #${projectId}`);
      setChecklistItems(items);
    } finally {
      setChecklistLoading(false);
    }
  }

  async function refreshChecklist() {
    if (!selectedProjectId) return;
    await openChecklist(selectedProjectId);
  }

  function updateLocalItem(itemId: number, patch: Partial<ChecklistItem>) {
    setChecklistItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it))
    );
  }

  async function saveChecklistItem(item: ChecklistItem) {
    const payload = {
      status: item.status,
      assignee: item.assignee,
      notes: item.notes,
    };
    const saved = await safeFetchJSON(
      `${API}/projects/${item.project_id}/checklist/${item.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...actorHeader },
        body: JSON.stringify(payload),
      }
    );

    updateLocalItem(item.id, saved);
  }

  async function addChecklistItem() {
    if (!selectedProjectId) return;

    if (!newItemTitle.trim()) {
      setError("Informe um título pro item do checklist.");
      return;
    }

    await safeFetchJSON(`${API}/projects/${selectedProjectId}/checklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...actorHeader },
      body: JSON.stringify({
        title: newItemTitle.trim(),
        status: newItemStatus,
        assignee: newItemAssignee,
        notes: newItemNotes,
      }),
    });

    setNewItemTitle("");
    setNewItemStatus("todo");
    setNewItemAssignee("");
    setNewItemNotes("");

    await refreshChecklist();
  }

  // ✅ NOVO: excluir item do checklist
  async function deleteChecklistItem(item: ChecklistItem) {
    const ok = window.confirm(`Excluir o item "${item.title}"?\n\nEssa ação não tem volta.`);
    if (!ok) return;

    await safeFetchJSON(`${API}/projects/${item.project_id}/checklist/${item.id}`, {
      method: "DELETE",
      headers: { ...actorHeader },
    });

    setChecklistItems((prev) => prev.filter((x) => x.id !== item.id));
  }

  // ------- INIT -------
  useEffect(() => {
    loadUsers().catch(() => {});
    loadTemplates().catch(() => {});
    loadProjects().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleResponsible(id: number) {
    setResponsaveis((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="title">ImplantHub</div>
          <div className="sub">Implantações Agrotis • controle e rastreabilidade</div>
        </div>

        <div className="nav">
          <button
            className={`navbtn ${view === "projects" ? "active" : ""}`}
            onClick={() => setView("projects")}
          >
            Projetos
          </button>
          <button
            className={`navbtn ${view === "users" ? "active" : ""}`}
            onClick={() => setView("users")}
          >
            Usuários
          </button>
        </div>

        <div className="small" style={{ padding: "12px 10px" }}>
          Autor das alterações (audit):<br />
          <select
            value={actorUserId ?? ""}
            onChange={(e) => setActorUserId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">(sem autor)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                #{u.id} — {u.name}
              </option>
            ))}
          </select>
        </div>
      </aside>

      <main className="content">
        <div className="topbar">
          <div>
            <h1 className="h1">{view === "projects" ? "Projetos" : "Usuários"}</h1>
            <p className="subtitle">
              {view === "projects"
                ? "Crie projetos sem JSON e edite o checklist dentro da tela."
                : "Cadastre usuários com nome e e-mail (pra vincular em projetos)."}
            </p>
          </div>

          <div className="badge" title="Status da API">
            <span className={apiOk ? "dot ok" : "dot"} />
            <span>{apiOk ? "API online" : "API offline"}</span>
          </div>
        </div>

        {error && (
          <div className="alert">
            <strong>Erro:</strong> {error}
          </div>
        )}

        {view === "users" && (
          <div className="grid">
            <section className="card">
              <h2>Criar usuário</h2>

              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label>Nome</label>
                  <input value={newUserName} onChange={(e) => setNewUserName(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>E-mail</label>
                  <input value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} />
                </div>
              </div>

              <div className="row" style={{ marginTop: 10 }}>
                <button className="button primary" onClick={() => createUser().catch(() => {})}>
                  Salvar usuário
                </button>
                <button className="button" onClick={() => loadUsers().catch(() => {})}>
                  Recarregar
                </button>
              </div>

              {result && <pre className="pre">{JSON.stringify(result, null, 2)}</pre>}
            </section>

            <section className="card">
              <h2>Lista de usuários</h2>
              <div className="row">
                <span className="pill">{users.length} usuário(s)</span>
              </div>

              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nome</th>
                    <th>E-mail</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>#{u.id}</td>
                      <td>{u.name}</td>
                      <td>{u.email}</td>
                    </tr>
                  ))}
                  {!users.length && (
                    <tr>
                      <td colSpan={3} style={{ color: "var(--muted)" }}>
                        Nenhum usuário ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </div>
        )}

        {view === "projects" && (
          <div className="grid">
            <section className="card span-2">
              <h2>Criar projeto</h2>

              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label>Título do projeto</label>
                  <input
                    placeholder="ERP / Armazenagem / Produtor Rural"
                    value={projectTitle}
                    onChange={(e) => setProjectTitle(e.target.value)}
                  />
                </div>

                <div className="field" style={{ width: 220 }}>
                  <label>Módulo</label>
                  <select
                    value={projectModule}
                    onChange={(e) => setProjectModule(e.target.value as any)}
                  >
                    <option value="ERP">ERP</option>
                    <option value="Armazenagem">Armazenagem</option>
                    <option value="Produtor Rural">Produtor Rural</option>
                  </select>
                </div>

                <div className="field" style={{ width: 220 }}>
                  <label>Status da implantação</label>
                  <select value={implStatus} onChange={(e) => setImplStatus(e.target.value as any)}>
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="row" style={{ marginTop: 10 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>Configurações iniciais</label>
                  <textarea
                    placeholder="Ex.: ambiente, acessos, parâmetros, integrações..."
                    value={initialConfig}
                    onChange={(e) => setInitialConfig(e.target.value)}
                  />
                </div>

                <div className="field" style={{ flex: 1 }}>
                  <label>Pendências</label>
                  <textarea
                    placeholder={
                      "Uma por linha.\nEx.:\n- Criar usuário no SAP\n- Validar cotação\n- Importar produtos"
                    }
                    value={pendencias}
                    onChange={(e) => setPendencias(e.target.value)}
                  />
                </div>
              </div>

              <div className="field" style={{ marginTop: 10 }}>
                <label>Responsáveis</label>
                <div className="row">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      className="button"
                      onClick={() => toggleResponsible(u.id)}
                      style={{
                        borderColor: responsaveis.includes(u.id)
                          ? "rgba(31, 122, 58, 0.6)"
                          : "var(--border)",
                        boxShadow: responsaveis.includes(u.id)
                          ? "0 0 0 4px rgba(31, 122, 58, 0.12)"
                          : "none",
                      }}
                      type="button"
                    >
                      {responsaveis.includes(u.id) ? "✓ " : ""}
                      {u.name}
                    </button>
                  ))}
                  {!users.length && <span className="pill">Crie usuários primeiro</span>}
                </div>
              </div>

              <div className="row" style={{ marginTop: 12 }}>
                <button
                  className="button primary"
                  onClick={() => createProject().catch(() => {})}
                  disabled={!projectTitle.trim()}
                >
                  Criar projeto (sem JSON)
                </button>

                <button className="button" onClick={() => loadProjects().catch(() => {})}>
                  Recarregar projetos
                </button>

                <button className="button" onClick={() => ensureDefaultTemplate().catch(() => {})}>
                  Garantir template padrão
                </button>
              </div>

              {result && <pre className="pre">{JSON.stringify(result, null, 2)}</pre>}
            </section>

            <section className="card span-2">
              <h2>Projetos cadastrados</h2>

              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nome</th>
                    <th>Status</th>
                    <th>Template</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td>#{p.id}</td>
                      <td>{p.client_name}</td>
                      <td>
                        <span className="pill">{p.status}</span>
                      </td>
                      <td>#{p.template_id}</td>
                      <td>
                        <button
                          className="button"
                          style={{ padding: "8px 10px" }}
                          onClick={() => openChecklist(p.id).catch(() => {})}
                        >
                          Abrir checklist
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!projects.length && (
                    <tr>
                      <td colSpan={5} style={{ color: "var(--muted)" }}>
                        Nenhum projeto ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="small">
                Observação: os 4 blocos (config/status/pendências/responsáveis) são itens do checklist +
                membros do projeto.
              </div>
            </section>

            {selectedProjectId && (
              <section className="card span-2">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <h2 style={{ marginBottom: 6 }}>
                      Checklist — #{selectedProjectId} • {selectedProjectName}
                    </h2>
                    <div className="small" style={{ marginTop: 0 }}>
                      Edite e clique em <strong>Salvar</strong>. Agora também dá pra{" "}
                      <strong>Adicionar</strong> e <strong>Excluir</strong>.
                    </div>
                  </div>

                  <div className="row">
                    <button className="button" onClick={() => refreshChecklist().catch(() => {})}>
                      Atualizar
                    </button>
                    <button
                      className="button"
                      onClick={() => {
                        setSelectedProjectId(null);
                        setSelectedProjectName("");
                        setChecklistItems([]);
                      }}
                    >
                      Fechar
                    </button>
                  </div>
                </div>

                {/* ADD ITEM */}
                <div className="row" style={{ marginTop: 12, gap: 12 }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Novo item</label>
                    <input
                      value={newItemTitle}
                      onChange={(e) => setNewItemTitle(e.target.value)}
                      placeholder="Ex.: Treinar equipe / Validar impostos / Conferir cadastros..."
                    />
                  </div>

                  <div className="field" style={{ width: 220 }}>
                    <label>Status</label>
                    <select value={newItemStatus} onChange={(e) => setNewItemStatus(e.target.value)}>
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field" style={{ width: 240 }}>
                    <label>Assignee</label>
                    <input
                      value={newItemAssignee}
                      onChange={(e) => setNewItemAssignee(e.target.value)}
                      placeholder="Nome"
                    />
                  </div>
                </div>

                <div className="row" style={{ marginTop: 10, alignItems: "flex-end" }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Notas</label>
                    <textarea
                      value={newItemNotes}
                      onChange={(e) => setNewItemNotes(e.target.value)}
                      placeholder="Detalhes, links, observações..."
                    />
                  </div>

                  <button
                    className="button primary"
                    style={{ height: 42 }}
                    onClick={() => addChecklistItem().catch(() => {})}
                  >
                    Adicionar item
                  </button>
                </div>

                {checklistLoading ? (
                  <div className="small">Carregando checklist...</div>
                ) : (
                  <table className="table" style={{ marginTop: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ width: "24%" }}>Item</th>
                        <th style={{ width: 160 }}>Status</th>
                        <th style={{ width: 180 }}>Assignee</th>
                        <th>Notas</th>
                        <th style={{ width: 170 }}>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checklistItems.map((it) => (
                        <tr key={it.id}>
                          <td style={{ fontWeight: 800 }}>{it.title}</td>
                          <td>
                            <select
                              value={it.status}
                              onChange={(e) => updateLocalItem(it.id, { status: e.target.value })}
                            >
                              {STATUS_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              value={it.assignee || ""}
                              placeholder="Nome"
                              onChange={(e) => updateLocalItem(it.id, { assignee: e.target.value })}
                            />
                          </td>
                          <td>
                            <textarea
                              value={it.notes || ""}
                              placeholder="Anotações / pendências / decisões..."
                              onChange={(e) => updateLocalItem(it.id, { notes: e.target.value })}
                            />
                          </td>
                          <td>
                            <div className="row" style={{ gap: 8 }}>
                              <button
                                className="button primary"
                                style={{ padding: "8px 10px" }}
                                onClick={() => saveChecklistItem(it).catch(() => {})}
                              >
                                Salvar
                              </button>

                              <button
                                className="button"
                                style={{ padding: "8px 10px", borderColor: "rgba(180,35,24,0.35)" }}
                                onClick={() => deleteChecklistItem(it).catch(() => {})}
                              >
                                Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                      {!checklistItems.length && (
                        <tr>
                          <td colSpan={5} style={{ color: "var(--muted)" }}>
                            Nenhum item no checklist.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
