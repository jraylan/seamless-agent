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
  - **Colar Imagens** — Cole imagens diretamente na área de input para dar contexto
  - **Referências & Anexos** — Referencie ficheiros do workspace usando `#filename` e anexe ficheiros à sua resposta
- **Validação de Tarefas** — Confirme se uma tarefa foi concluída conforme as suas especificações

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

### Histórico (Ask User, Plan Review)

O painel do Seamless Agent inclui um Histórico unificado (mais recente primeiro), com filtros:

- **Todos**
- **Ask User**
- **Plan Review**

Pode abrir detalhes de ask_user, abrir painéis de plan review a partir do histórico e apagar itens individuais.

### Ferramenta Approve Plan (`#approvePlan`) (Deprecada)

Alias por compatibilidade para plan review.

## Como Usar

Após a instalação, as ferramentas estão automaticamente disponíveis para o GitHub Copilot Chat.

### Uso Automático

O Copilot usará automaticamente esta ferramenta quando precisar da sua confirmação. Quando acionada:

1. Uma notificação aparece no VS Code
2. Clique em "Abrir Consola" para abrir o painel de pedidos
3. Escreva a sua resposta
4. O Copilot continua com base na sua resposta

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

## Dicas

### Prompt de Sistema Recomendado

Para garantir que a IA peça aprovação nos momentos certos, adicione o seguinte às suas instruções personalizadas ou prompt de sistema:

```
Quando a tarefa exigir múltiplos passos ou alterações não triviais, apresente um plano detalhado usando #planReview e aguarde aprovação antes de executar.
Se o plano for rejeitado, incorpore os comentários e submeta um plano atualizado com #planReview.
Quando o utilizador pedir um guia passo a passo (walkthrough), apresente-o usando #walkthroughReview.
Utilize sempre #askUser antes de concluir qualquer tarefa para confirmar com o utilizador que o pedido foi atendido corretamente.
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

Esta extensão funciona imediatamente sem necessidade de configuração. Só precisa de instruir o seu agente a utilizá-la.

### Contexto de Armazenamento (`seamless-agent.storageContext`) 🔧

Determina onde o histórico das ferramenta são armazenados.

- **global** — Armazena o histórico em todos os espaços de trabalho (partilhado).
- **workspace** — Armazena o histórico específico para o espaço de trabalho atual (predefinição).

**Predefinição:** `workspace`

Exemplo (settings.json):

```json
"seamless-agent.storageContext": "global"
```

> Nota: Mudar esta definição altera onde a extensão guarda o histórico do chat; alternar entre valores pode fazer com que o histórico previamente guardado não esteja disponível no contexto atual.

## MCP / Antigravity

Se usa Antigravity IDE via MCP, veja [README.antigravity.md](README.antigravity.md) para detalhes de integração e troubleshooting.

## Releases (mantenedores)

Este repositório usa Release Please para gerar changelog e tags a partir de Conventional Commits.

Se um único squash-merge tiver múltiplas mudanças lógicas, pode incluir **múltiplos cabeçalhos de Conventional Commit** na mensagem do commit (ou na descrição da PR, dependendo das configurações de squash do repositório). O Release Please vai interpretá-los como entradas separadas no changelog, por exemplo:

```
fix: impedir comentário em linha horizontal

feat: adicionar anexos de pasta

refactor: reorganizar providers do webview
```

Para squash merges, também pode sobrescrever o parsing do merge commit adicionando este bloco no corpo da PR:

```
BEGIN_COMMIT_OVERRIDE
fix: impedir comentário em linha horizontal
feat: adicionar anexos de pasta
refactor: reorganizar providers do webview
END_COMMIT_OVERRIDE
```

## Problemas Conhecidos

Nenhum até ao momento. Por favor, reporte problemas no [GitHub](https://github.com/jraylan/seamless-agent/issues).

## Licença

[MIT](LICENSE.md)
