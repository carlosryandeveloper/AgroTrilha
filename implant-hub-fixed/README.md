# ImplantHub (v0.2.1)

Correções e melhorias:
- Backend agora espera o Postgres ficar pronto (healthcheck + retry)
- CORS habilitado no backend (pra evitar dor de cabeça no navegador)
- Frontend usa `/api` com proxy do Vite (menos gambiarra com URL)
- UI/CSS com “cara Agrotis” (verde, limpo, corporativo)

## Subir localmente (Docker)
```bash
docker compose up --build
```

- API (Swagger): http://localhost:8000/docs
- Frontend: http://localhost:5173

## Autoria das alterações (MVP)
Use o header:
- `X-User-Id: <id_do_usuario>`

## Como o frontend chama a API
O frontend chama por padrão:
- `/api/...`

E o Vite faz proxy para o backend (target configurado por `VITE_PROXY_TARGET`).

## Rotas principais
- Users:
  - POST /users
  - GET /users

- Templates:
  - POST /templates
  - GET /templates
  - GET /templates/{id}
  - POST /templates/link-requirement
  - POST /templates/link-decision

- Projetos:
  - POST /projects
  - GET /projects
  - GET /projects/{id}/checklist
  - PATCH /projects/{project_id}/checklist/{item_id}
  - POST /projects/{project_id}/members
  - GET /projects/{project_id}/members
  - GET /projects/{project_id}/audit
