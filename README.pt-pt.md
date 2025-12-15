# Seamless Agent

[![English](https://img.shields.io/badge/lang-en-green)](README.md) [![Português Brasileiro](https://img.shields.io/badge/lang-pt--BR-green)](README.pt-br.md) ![Português Europeu](https://img.shields.io/badge/lang-pt--PT-blue)

Seamless Agent aprimora o GitHub Copilot fornecendo ferramentas interativas de confirmação do utilizador. Permite que agentes de IA solicitem aprovação antes de executar ações, garantindo que mantenha o controlo.

![VS Code](https://img.shields.io/badge/VS%20Code-1.106.1+-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Funcionalidades

### Ferramenta Ask User (`#askUser`)

Uma ferramenta de Language Model que permite ao Copilot solicitar confirmação ou informações adicionais durante sessões de chat.

- **Confirmação do Utilizador** — Obtenha aprovação explícita antes do Copilot executar ações críticas
- **Input Interativo** — Forneça contexto adicional ou instruções durante a conversa
- **Validação de Tarefas** — Confirme se uma tarefa foi concluída conforme as suas especificações
- **Integração Seamless** — Funciona naturalmente dentro do fluxo do Copilot Chat
- **Colar Imagens** — Cole imagens diretamente na área de input para dar contexto
- **Referências & Anexos** — Referencie ficheiros do workspace usando `#filename` e anexe ficheiros à sua resposta

### Ferramenta Plan Review (`#planReview`)

Uma ferramenta de Language Model que apresenta conteúdo Markdown num painel dedicado de revisão, para poder aprovar ou pedir alterações com comentários associados a partes específicas.

- **Painel de Revisão** — Leia o plano numa visão focada
- **Feedback Direcionado** — Comentários em títulos/parágrafos/itens de lista específicos
- **Retorno Estruturado** — Devolve `{ status, requiredRevisions: [{ revisedPart, revisorInstructions }], reviewId }` ao agente
- **Mais Segurança** — Evita execução antes da sua aprovação

> Nota: `#approvePlan` é suportado por compatibilidade, mas `#planReview` é o recomendado.

### Ferramenta Walkthrough Review (`#walkthroughReview`)

Uma ferramenta de Language Model que apresenta conteúdo Markdown como um walkthrough (passo a passo) num painel dedicado, para poder comentar e pedir revisões.

- **Painel de Walkthrough** — Ideal para passos sequenciais e guiados
- **Suporte a Comentários** — Feedback ancorado em partes específicas do walkthrough
- **Retorno Estruturado** — Devolve `{ status, requiredRevisions: [{ revisedPart, revisorInstructions }], reviewId }`

### Task Lists (novo fluxo)

Listas de tarefas interativas (com painel dedicado) para acompanhar progresso e deixar feedback enquanto o agente trabalha.

- **Painel em Tempo Real** — UI estilo walkthrough com estado e progresso
- **Comentários por Tarefa** — Comente em qualquer tarefa (incluindo reabrir uma tarefa concluída)
- **Integração com Histórico** — Task lists fechadas aparecem no Histórico

#### Fluxo recomendado para Task Lists

Para garantir que o agente recebe os seus comentários **antes** de executar cada tarefa, use o fluxo abaixo:

- `#createTaskList` → cria a lista e devolve `listId`
- `#getNextTask` → devolve a próxima tarefa pendente **+ comentários pendentes dessa tarefa**
- `#updateTaskStatus` → atualiza estado (in-progress / completed / blocked). De seguida, chame `#getNextTask` para obter a próxima tarefa + comentários
- `#closeTaskList` → arquiva a lista e devolve um resumo

### Histórico (Ask User, Plan Review, Task Lists)

O painel do Seamless Agent inclui um Histórico unificado (mais recente primeiro), com filtros:

- **Todos**
- **Task Lists**
- **Ask User**
- **Plan Review**

Pode abrir detalhes de ask_user, reabrir plan reviews/task lists pelo histórico e apagar itens individuais.

### Ferramenta Approve Plan (`#approvePlan`) (Deprecada)

Alias por compatibilidade para plan review.

## Como Usar

Após a instalação, as ferramentas estão automaticamente disponíveis para o GitHub Copilot Chat.

### Uso Automático

O Copilot usará automaticamente esta ferramenta quando precisar da sua confirmação. Quando acionada:

1. Uma notificação aparece no VS Code
2. Clique em "Responder" para abrir a caixa de diálogo de input
3. Escreva a sua resposta
4. O Copilot continua baseado na sua resposta

### Rever um plano com `#planReview` (tool: `plan_review`)

O Copilot usará esta ferramenta quando precisar da sua aprovação sobre um plano antes de avançar. Quando acionada:

1. Abre um painel “Review Plan” (Rever Plano) no editor
2. Passe o rato sobre um título/parágrafo/item de lista e clique no ícone de comentário para adicionar feedback
3. Clique em **Approve** para continuar, ou **Request Changes** para pedir ajustes
4. O Copilot continua com base em `{ status, requiredRevisions, reviewId }`

> Ainda pode pedir explicitamente `#approvePlan`, mas prefira `#planReview`.

### Rever um walkthrough com `#walkthroughReview` (tool: `walkthrough_review`)

Use quando quiser um guia passo a passo apresentado para revisão/feedback.

1. Abre um painel de walkthrough no editor
2. Adicione comentários onde quer mudanças
3. Clique em **Approve** para continuar, ou **Request Changes** para pedir ajustes
4. O Copilot continua com base em `{ status, requiredRevisions, reviewId }`

### Usar Task Lists (fluxo recomendado)

Em alto nível, o agente deve:

1. Criar a lista com `#createTaskList` (guardar o `listId`)
2. Loop:
   - Chamar `#getNextTask`
   - Aplicar `comments[]` **antes** de executar a tarefa
   - Executar a tarefa
   - Chamar `#updateTaskStatus`
3. Ao terminar, chamar `#closeTaskList`

## Dicas

### Prompt de Sistema Recomendado

Para garantir que a IA peça aprovação nos momentos certos, adicione o seguinte às suas instruções personalizadas ou prompt de sistema:

```
Quando a tarefa exigir múltiplos passos ou alterações não triviais, apresente um plano detalhado usando #planReview e aguarde aprovação antes de executar.
Se o plano for rejeitado, incorpore os comentários e submeta um plano atualizado com #planReview.
Quando o utilizador pedir um guia passo a passo (walkthrough), apresente-o usando #walkthroughReview.
Utilize sempre #askUser antes de concluir qualquer tarefa para confirmar com o utilizador que o pedido foi atendido corretamente.

Quando usar task lists, prefira o fluxo: #createTaskList → #getNextTask → #updateTaskStatus → ... → #closeTaskList.
```

Pode adicionar isto ao ficheiro `.github/copilot-instructions.md` no seu projeto

### Tutorial rápido: usar `#planReview` (tool: `plan_review`)

Se quiser forçar a revisão do plano desde o início, peça algo como:

```
Antes de mudar qualquer coisa, escreva um plano passo a passo e apresente com #planReview.
Aguarde a minha aprovação (ou pedidos de ajuste). Só depois implemente o plano.
```

## Requisitos

- VS Code 1.104.1 ou superior
- Extensão GitHub Copilot Chat

## Definições

Esta extensão funciona imediatamente sem necessidade de configuração.

## MCP / Antigravity

Se usa Antigravity IDE via MCP, veja [README.antigravity.md](README.antigravity.md) para detalhes de integração e troubleshooting.

## Problemas Conhecidos

Nenhum até ao momento. Por favor, reporte problemas no [GitHub](https://github.com/jraylan/seamless-agent/issues).

## Licença

[MIT](LICENSE.md)
