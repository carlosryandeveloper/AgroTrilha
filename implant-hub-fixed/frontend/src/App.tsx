import React, { useEffect, useMemo, useState } from "react";

type User = { id: number; name: string; email: string };
type Template = { id: number; name: string; description: string };
type Project = { id: number; template_id: number; client_name: string; status: string };
type ChecklistItem = {
  id: number;
  project_id: number;
  activity_id: number;
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

  // ------- TEMPLATE AUTO (sem você digitar JSON) -------
  async function ensureDefaultTemplate(): Promise<number> {
    const list: Template[] = await safeFetchJSON(`${API}/templates`);
    setTemplates(list);

    const found = list.find((t) => normalize(t.name) === normalize(DEFAULT_TEMPLATE_NAME));
    if (found) return found.id;

    // cria automaticamente um template padrão
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

    // a rota retorna o template base, então pegamos id
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

  // ------- PROJECTS: CREATE (sem JSON manual) -------
  async function createProject() {
    if (!projectTitle.trim()) {
      setError("Dê um nome pro projeto (ex.: ERP, Armazenagem, Produtor Rural).");
      return;
    }

    // garante template padrão
    const templateId = await ensureDefaultTemplate();

    // cria projeto (client_name vira "título do projeto")
    const created = await safeFetchJSON(`${API}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...actorHeader },
      body: JSON.stringify({
        template_id: templateId,
        client_name: `${projectTitle.trim()} • ${projectModule}`,
      }),
    });

    const projectId = created.project_id as number;

    // pega checklist criado
    const checklistRes = await safeFetchJSON(`${API}/projects/${projectId}/checklist`);
    const items: ChecklistItem[] = checklistRes.items || [];

    // acha os 4 itens “seção”
    const byTitle = new Map<string, ChecklistItem>();
    for (const it of items) byTitle.set(normalize(it.title), it);

    const configItem = byTitle.get(normalize("Configurações iniciais"));
    const statusItem = byTitle.get(normalize("Status da implantação"));
    const pendItem = byTitle.get(normalize("Pendências"));
    const respItem = byTitle.get(normalize("Responsáveis"));

    // preenche config/status/pendências via PATCH no checklist
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

    // vincula responsáveis (ProjectMember) + registra no item “Responsáveis”
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

    // refresh list
    await loadProjects();

    // limpa form (pra criar outro rápido)
    setProjectTitle("");
    setInitialConfig("");
    setPendencias("");
    setResponsaveis([]);
    setImplStatus("todo");
  }

  // ------- INIT -------
  useEffect(() => {
    loadUsers().catch(() => {});
    loadTemplates().catch(() => {});
    loadProjects().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------- UI HELPERS -------
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
                ? "Crie projetos sem JSON: título, configurações, status, pendências e responsáveis."
                : "Cadastre usuários com nome e e-mail (pra vincular em projetos)."}
            </p>
          </div>

          <div className="badge" title="Status da API">
            <span className={apiOk ? "dot ok" : "dot"} />
            <span>{apiOk ? "API online" : "API offline"}</span>
          </div>
        </div>

        {error && <div className="alert"><strong>Erro:</strong> {error}</div>}

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
                  <select value={projectModule} onChange={(e) => setProjectModule(e.target.value as any)}>
                    <option value="ERP">ERP</option>
                    <option value="Armazenagem">Armazenagem</option>
                    <option value="Produtor Rural">Produtor Rural</option>
                  </select>
                </div>

                <div className="field" style={{ width: 220 }}>
                  <label>Status da implantação</label>
                  <select value={implStatus} onChange={(e) => setImplStatus(e.target.value as any)}>
                    <option value="todo">Planejamento</option>
                    <option value="doing">Em andamento</option>
                    <option value="blocked">Bloqueado</option>
                    <option value="done">Concluído</option>
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
                    placeholder="Uma por linha. Ex.:\n- Criar usuário no SAP\n- Validar cotação\n- Importar produtos"
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
                          ? "0 0 0 4px var(--primary-soft)"
                          : "none",
                      }}
                      type="button"
                    >
                      {responsaveis.includes(u.id) ? "✓ " : ""}{u.name}
                    </button>
                  ))}
                  {!users.length && (
                    <span className="pill">Crie usuários primeiro</span>
                  )}
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
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td>#{p.id}</td>
                      <td>{p.client_name}</td>
                      <td><span className="pill">{p.status}</span></td>
                      <td>#{p.template_id}</td>
                    </tr>
                  ))}
                  {!projects.length && (
                    <tr>
                      <td colSpan={4} style={{ color: "var(--muted)" }}>
                        Nenhum projeto ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="small">
                Observação: os 4 blocos (config/status/pendências/responsáveis) são gravados como itens do checklist + membros do projeto.
                Isso garante rastreabilidade sem você ter que “mexer no banco” agora.
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
