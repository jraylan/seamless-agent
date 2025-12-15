# Seamless Agent

![Português do Brasil](https://img.shields.io/badge/lang-pt--BR-blue) [![English](https://img.shields.io/badge/lang-en-green)](README.md) [![Português Europeu](https://img.shields.io/badge/lang-pt--PT-green)](README.pt-pt.md)

Seamless Agent aprimora o GitHub Copilot fornecendo ferramentas interativas de confirmação do usuário. Permite que agentes de IA solicitem aprovação antes de executar ações, garantindo que você mantenha o controle.

![VS Code](https://img.shields.io/badge/VS%20Code-1.106.1+-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Funcionalidades

### Ferramenta Ask User (`#askUser`)

Uma ferramenta de Language Model que permite ao Copilot solicitar confirmação ou informações adicionais durante sessões de chat.

- **Confirmação do Usuário** — Obtenha aprovação explícita antes do Copilot executar ações críticas
- **Input Interativo** — Forneça contexto adicional ou instruções durante a conversa
- **Validação de Tarefas** — Confirme se uma tarefa foi concluída conforme suas especificações
- **Integração Seamless** — Funciona naturalmente dentro do fluxo do Copilot Chat
- **Colar Imagens** — Cole imagens diretamente na área de input para dar contexto
- **Referências & Anexos** — Referencie arquivos do workspace usando `#filename` e anexe arquivos à sua resposta

### Ferramenta Plan Review (`#planReview`)

Uma ferramenta de Language Model que apresenta conteúdo Markdown em um painel dedicado de revisão, para você aprovar ou pedir mudanças com comentários vinculados a partes específicas.

- **Painel de Revisão** — Leia o plano em uma visão focada
- **Feedback Direcionado** — Comente em títulos/parágrafos/itens de lista específicos
- **Retorno Estruturado** — Retorna `{ status, requiredRevisions: [{ revisedPart, revisorInstructions }], reviewId }` para o agente
- **Mais Segurança** — Evita execução antes da sua aprovação

> Observação: `#approvePlan` é suportado por compatibilidade, mas `#planReview` é o recomendado.

### Ferramenta Walkthrough Review (`#walkthroughReview`)

Uma ferramenta de Language Model que apresenta conteúdo Markdown como um walkthrough (passo a passo) em um painel dedicado, para você comentar e pedir revisões.

- **Painel de Walkthrough** — Ideal para passos sequenciais e guiados
- **Suporte a Comentários** — Feedback ancorado em partes específicas do walkthrough
- **Retorno Estruturado** — Retorna `{ status, requiredRevisions: [{ revisedPart, revisorInstructions }], reviewId }`

### Task Lists (novo fluxo)

Listas de tarefas interativas (com painel dedicado) para acompanhar progresso e deixar feedback enquanto o agente trabalha.

- **Painel em Tempo Real** — UI estilo walkthrough com status e progresso
- **Comentários por Tarefa** — Comente em qualquer tarefa (inclusive reabrindo uma tarefa concluída)
- **Integração com Histórico** — Task lists fechadas aparecem no Histórico

#### Fluxo recomendado para Task Lists

Para garantir que o agente receba seus comentários **antes** de executar cada tarefa, use o fluxo abaixo:

- `#createTaskList` → cria a lista e retorna `listId`
- `#getNextTask` → retorna a próxima tarefa pendente **+ comentários pendentes dessa tarefa**
- `#updateTaskStatus` → atualiza status (in-progress / completed / blocked). Em seguida, chame `#getNextTask` para obter a próxima tarefa + comentários
- `#closeTaskList` → arquiva a lista e retorna um resumo

### Histórico (Ask User, Plan Review, Task Lists)

O painel do Seamless Agent inclui um Histórico unificado (mais recente primeiro), com filtros:

- **Todos**
- **Task Lists**
- **Ask User**
- **Plan Review**

Você pode abrir detalhes de ask_user, reabrir plan reviews/task lists pelo histórico e apagar itens individuais.

### Ferramenta Approve Plan (`#approvePlan`) (Deprecada)

Alias por compatibilidade para plan review.

## Como Usar

Após a instalação, as ferramentas estão automaticamente disponíveis para o GitHub Copilot Chat.

### Uso Automático

O Copilot usará automaticamente esta ferramenta quando precisar da sua confirmação. Quando acionada:

1. Uma notificação aparece no VS Code
2. Clique em "Responder" para abrir o diálogo de input
3. Digite sua resposta
4. O Copilot continua baseado na sua resposta

### Revisando um plano com `#planReview` (tool: `plan_review`)

O Copilot usará esta ferramenta quando quiser sua aprovação em um plano antes de prosseguir. Quando acionada:

1. Um painel “Review Plan” (Revisar Plano) abre no editor
2. Passe o mouse sobre um título/parágrafo/item de lista e clique no ícone de comentário para adicionar feedback
3. Clique em **Approve** para seguir, ou **Request Changes** para pedir ajustes
4. O Copilot continua com base em `{ status, requiredRevisions, reviewId }`

> Você ainda pode pedir explicitamente `#approvePlan`, mas prefira `#planReview`.

### Revisando um walkthrough com `#walkthroughReview` (tool: `walkthrough_review`)

Use quando você quiser um guia passo a passo apresentado para revisão/feedback.

1. Um painel de walkthrough abre no editor
2. Adicione comentários onde você quer mudanças
3. Clique em **Approve** para seguir, ou **Request Changes** para pedir ajustes
4. O Copilot continua com base em `{ status, requiredRevisions, reviewId }`

### Usando Task Lists (fluxo recomendado)

Em alto nível, o agente deve:

1. Criar a lista com `#createTaskList` (guarde o `listId`)
2. Loop:
   - Chamar `#getNextTask`
   - Aplicar `comments[]` **antes** de executar a tarefa
   - Executar a tarefa
   - Chamar `#updateTaskStatus`
3. Ao finalizar, chamar `#closeTaskList`

## Dicas

### Prompt de Sistema Recomendado

Para garantir que a IA peça aprovação nos momentos certos, adicione o seguinte às suas instruções personalizadas ou prompt de sistema:

```
Quando a tarefa exigir múltiplos passos ou mudanças não triviais, apresente um plano detalhado usando #planReview e aguarde aprovação antes de executar.
Se o plano for rejeitado, incorpore os comentários e envie um plano atualizado com #planReview.
Quando o usuário pedir um guia passo a passo (walkthrough), apresente-o usando #walkthroughReview.
Sempre use #askUser antes de concluir qualquer tarefa para confirmar com o usuário que a solicitação foi atendida corretamente.

Quando usar task lists, prefira o fluxo: #createTaskList → #getNextTask → #updateTaskStatus → ... → #closeTaskList.
```

Você pode adicionar isso ao arquivo `.github/copilot-instructions.md` do seu projeto

### Tutorial rápido: usando `#planReview` (tool: `plan_review`)

Se você quiser forçar a revisão do plano desde o começo, peça algo como:

```
Antes de mudar qualquer coisa, escreva um plano passo a passo e apresente com #planReview.
Aguarde minha aprovação (ou pedidos de ajuste). Só então implemente o plano.
```

## Requisitos

- VS Code 1.106.1 ou superior
- Extensão GitHub Copilot Chat

## Configurações

Esta extensão funciona imediatamente sem necessidade de configuração.

## MCP / Antigravity

Se você usa Antigravity IDE via MCP, veja [README.antigravity.md](README.antigravity.md) para detalhes de integração e troubleshooting.

## Releases (mantenedores)

Este repositório usa Release Please para gerar changelog e tags a partir de Conventional Commits.

Se um único squash-merge tiver múltiplas mudanças lógicas, você pode incluir **múltiplos cabeçalhos de Conventional Commit** na mensagem do commit (ou na descrição da PR, dependendo das configurações de squash do repositório). O Release Please vai interpretar como entradas separadas no changelog, por exemplo:

```
fix: impedir comentário em linha horizontal

feat: adicionar anexos de pasta

refactor: reorganizar providers do webview
```

Para squash merges, você também pode sobrescrever o parsing do merge commit adicionando este bloco no corpo da PR:

```
BEGIN_COMMIT_OVERRIDE
fix: impedir comentário em linha horizontal
feat: adicionar anexos de pasta
refactor: reorganizar providers do webview
END_COMMIT_OVERRIDE
```

## Problemas Conhecidos

Nenhum até o momento. Por favor, reporte problemas no [GitHub](https://github.com/jraylan/seamless-agent/issues).

## Licença

[MIT](LICENSE.md)
