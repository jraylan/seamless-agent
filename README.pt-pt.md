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

## Como Usar

Após a instalação, a ferramenta `ask_user` está automaticamente disponível para o GitHub Copilot Chat.

### Uso Automático

O Copilot usará automaticamente esta ferramenta quando precisar da sua confirmação. Quando acionada:

1. Uma notificação aparece no VS Code
2. Clique em "Responder" para abrir a caixa de diálogo de input
3. Escreva a sua resposta
4. O Copilot continua baseado na sua resposta

## Dicas

### Prompt de Sistema Recomendado

Para garantir que a IA sempre peça a sua confirmação antes de concluir tarefas, adicione o seguinte às suas instruções personalizadas ou prompt de sistema:

```
Utilize sempre a ferramenta ask_user antes de concluir qualquer tarefa para confirmar com o utilizador que o pedido foi atendido corretamente.
```

Pode adicionar isto no VS Code indo a:

- **Definições** → Pesquise por `github.copilot.chat.codeGeneration.instructions`
- Ou adicione ao ficheiro `.github/copilot-instructions.md` no seu projeto

## Requisitos

- VS Code 1.106.1 ou superior
- Extensão GitHub Copilot Chat

## Definições

Esta extensão funciona imediatamente sem necessidade de configuração.

## Problemas Conhecidos

Nenhum até ao momento. Por favor, reporte problemas no [GitHub](https://github.com/jraylan/seamless-agent/issues).

## Notas de Versão

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
