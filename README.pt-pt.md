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
- **Colar Imagens** — Cole imagens diretamente na área de entrada para contexto
- **Referências e Anexos** — Referencie ficheiros do seu workspace usando `#nomedoficheiro` e anexe ficheiros à sua resposta

### Ferramenta Approve Plan (`#approvePlan`)

Uma ferramenta de Language Model que apresenta um plano num painel dedicado de revisão, para poder aprovar ou pedir alterações com comentários associados a partes específicas do plano.

- **Revisão do Plano** — Painel focado para analisar o plano
- **Feedback Direcionado** — Comentários em títulos/parágrafos/itens de lista específicos
- **Retorno Estruturado** — Devolve `{ approved, comments: [{ citation, comment }] }` ao agente
- **Mais Segurança** — Evita execução antes da sua aprovação

## Como Usar

Após a instalação, as ferramentas `ask_user` e `approve_plan` estão automaticamente disponíveis para o GitHub Copilot Chat.

### Uso Automático

O Copilot usará automaticamente esta ferramenta quando precisar da sua confirmação. Quando acionada:

1. Uma notificação aparece no VS Code
2. Clique em "Responder" para abrir a caixa de diálogo de input
3. Escreva a sua resposta
4. O Copilot continua baseado na sua resposta

### Rever um plano com `approve_plan`

O Copilot usará esta ferramenta quando precisar da sua aprovação sobre um plano antes de avançar. Quando acionada:

1. Abre um painel “Review Plan” (Rever Plano) no editor
2. Passe o rato sobre um título/parágrafo/item de lista e clique no ícone de comentário para adicionar feedback
3. Clique em **Approve** para continuar, ou **Request Changes** para pedir ajustes
4. O Copilot continua com base em `{ approved, comments }`

## Dicas

### Prompt de Sistema Recomendado

Para garantir que a IA peça aprovação nos momentos certos, adicione o seguinte às suas instruções personalizadas ou prompt de sistema:

```
Quando a tarefa exigir múltiplos passos ou alterações não triviais, apresente um plano detalhado usando #approvePlan e aguarde aprovação antes de executar.
Se o plano for rejeitado, incorpore os comentários e submeta um plano atualizado com #approvePlan.
Utilize sempre #askUser antes de concluir qualquer tarefa para confirmar com o utilizador que o pedido foi atendido corretamente.
```

Pode adicionar isto ao ficheiro `.github/copilot-instructions.md` no seu projeto

### Tutorial rápido: usar `approve_plan`

Se quiser forçar a revisão do plano desde o início, peça algo como:

```
Antes de mudar qualquer coisa, escreva um plano passo a passo e apresente com #approvePlan.
Aguarde a minha aprovação (ou pedidos de ajuste). Só depois implemente o plano.
```

## Requisitos

- VS Code 1.106.1 ou superior
- Extensão GitHub Copilot Chat

## Definições

Esta extensão funciona imediatamente sem necessidade de configuração.

## Problemas Conhecidos

Nenhum até ao momento. Por favor, reporte problemas no [GitHub](https://github.com/jraylan/seamless-agent/issues).

## Notas de Versão

### 0.1.9

#### Adicionado

- **Autocompletar Referência de Ficheiros**: Escreva `#` na área de resposta para procurar e referenciar ficheiros do workspace. Ficheiros selecionados são automaticamente anexados e sincronizados com o seu texto.
- **Chips de Anexos**: Anexos de ficheiros são agora apresentados como chips visuais acima da área de texto para fácil gestão.
- **Colar Imagens**: Cole imagens diretamente na área de entrada para anexá-las.
- **Botão de Anexar**: Novo botão 📎 para adicionar anexos de ficheiros rapidamente via seletor de ficheiros.

#### Alterado

- **Suporte a Imagens Inline**: Imagens coladas na ferramenta `ask_user` são agora passadas diretamente para a IA usando dados binários `LanguageModelDataPart.image()`, eliminando a necessidade de uma ferramenta separada de visualização de imagens.
- **Anexos Simplificados**: Formato de resposta de anexos simplificado para um array de strings de URIs de ficheiros.
- **Nomenclatura de Imagens Simplificada**: Imagens coladas agora usam nomes simples (`image-pasted.png`, `image-pasted-1.png`) em vez de timestamps longos.
- **Referências de Ficheiros Simplificadas**: Referências de ficheiros agora usam formato `#nomedoficheiro` em vez de `#file:nomedoficheiro`.

### 0.1.8

#### Adicionado

- **Approve Plan**: Adicionada a ferramenta `approve_plan` (`#approvePlan`) para rever/aprovar planos com comentários antes da execução (VSCode)

### 0.1.7

#### Corrigido

- **Webview**: Resolvido um problema em que o prompt de recurso era aberto quando o Webview não recebia o foco do utilizador (VSCode)

#### Alterado

- **Documentação**: Adicionadas instruções para os utilizadores do Antigravity (Antigravity)

### 0.1.5

#### Adicionado

- **Antigravity**: Adicionado suporte ao Antigravity

### 0.1.4

#### Corrigido

- **Contador de Pedidos**: Corrigido distintivo que não reiniciava para 0 após todos os pedidos serem fechados (estava a mostrar "1" incorretamente)
- **Comportamento de Notificação**: Notificações agora aparecem apenas quando o painel Seamless Agent não está visível, reduzindo interrupções quando o painel já está aberto

### 0.1.3

- [jraylan:feature/dedicated-view-panel](https://github.com/jraylan/seamless-agent/pull/6)

#### Adicionado

- **Múltiplos Pedidos Concorrentes**: Suporte para múltiplos pedidos com visualização em lista
- **Anexos**: Suporte a anexos de ficheiros com seletor Quick Pick do VS Code

#### Alterado

- **Layout**: Algumas atualizações no layout para deixar o painel de pedidos parecido com o chat do Copilot
- **Lista de Tarefas**: UI da lista de tarefas melhorada com melhor hierarquia visual
- **Descarte**: O pedido será descartado quando o agente parar
- **Ícone do Painel**: Ícone do painel atualizado para combinar com a linguagem de design do VS Code
- **Contador Badge**: Badge visual mostrando o número de pedidos pendentes

### 0.1.2

- [bicheichane:feature/dedicated-view-panel](https://github.com/jraylan/seamless-agent/pull/4)

#### Adicionado

- **Painel Dedicado**: Novo painel "Seamless Agent" registado na área do painel inferior (junto com Terminal/Output), fornecendo um espaço de trabalho não intrusivo para interações com o agente
- **Renderização Markdown Completa**: Suporte completo a Markdown incluindo:
  - Cabeçalhos, negrito, itálico, riscado
  - Blocos de código com **syntax highlighting** para 10 linguagens: JavaScript/TypeScript, Python, C#, Java, CSS, HTML/XML, JSON, Bash/Shell, SQL
  - Citações em bloco, listas ordenadas e não ordenadas
  - Links (auto-linkified), tabelas
- **Input Multi-Linha**: Elemento `<textarea>` permite escrever respostas detalhadas, colar excertos de código e usar `Ctrl+Enter` para enviar
- **Notificações Não-Intrusivas**:
  - Indicador badge na aba do painel mostrando contagem de pedidos pendentes
  - Notificação informativa como alerta suplementar com ação "Abrir Consola"
  - Painel auto-revela mas preserva o foco (`preserveFocus: true`)
- **Fallback Gracioso**: Se o painel webview não estiver disponível, a ferramenta automaticamente volta para a abordagem de caixas de diálogo do VS Code

#### Alterado

- Movida UI de confirmação de caixas de diálogo popup para painel dedicado
- Atualizada configuração do esbuild para compilar scripts do webview separadamente
- Melhorado sistema de localização com suporte para EN, PT-BR e PT

#### Corrigido

- Adicionado `dist/` ao `.gitignore` para evitar commit de artefatos de build

### 0.0.4

- Lançamento beta inicial
- Adicionada ferramenta `ask_user` para Language Model
- Suporte multi-idioma (Inglês, Português)

## Licença

[MIT](LICENSE.md)
