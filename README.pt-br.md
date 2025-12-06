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

## Como Usar

Após a instalação, a ferramenta `ask_user` está automaticamente disponível para o GitHub Copilot Chat.

### Uso Automático

O Copilot usará automaticamente esta ferramenta quando precisar da sua confirmação. Quando acionada:

1. Uma notificação aparece no VS Code
2. Clique em "Responder" para abrir o diálogo de input
3. Digite sua resposta
4. O Copilot continua baseado na sua resposta

## Dicas

### Prompt de Sistema Recomendado

Para garantir que a IA sempre peça sua confirmação antes de concluir tarefas, adicione o seguinte às suas instruções personalizadas ou prompt de sistema:

```
Sempre use a ferramenta ask_user antes de concluir qualquer tarefa para confirmar com o usuário que a solicitação foi atendida corretamente.
```

Você pode adicionar isso no VS Code indo em:

- **Configurações** → Pesquise por `github.copilot.chat.codeGeneration.instructions`
- Ou adicione ao arquivo `.github/copilot-instructions.md` no seu projeto

## Requisitos

- VS Code 1.106.1 ou superior
- Extensão GitHub Copilot Chat

## Configurações

Esta extensão funciona imediatamente sem necessidade de configuração.

## Problemas Conhecidos

Nenhum até o momento. Por favor, reporte problemas no [GitHub](https://github.com/jraylan/seamless-agent/issues).

## Notas de Versão

### 0.1.3

- [jraylan:feature/dedicated-view-panel](https://github.com/jraylan/seamless-agent/pull/6)

#### Adicionado

- **Múltiplas Requisições Concorrentes**: Suporte para múltiplas requisições com visualização em lista
- **Anexos**: Suporte a anexos de arquivos com seletor Quick Pick do VS Code

#### Alterado

- **Layout**: Algumas atualizações no layout para deixar o painel de requisições parecido com o chat do Copilot
- **Lista de Tarefas**: UI da lista de tarefas melhorada com melhor hierarquia visual
- **Descarte**: A requisição será descartada quando o agente parar
- **Ícone do Painel**: Ícone do painel atualizado para combinar com a linguagem de design do VS Code
- **Contador Badge**: Badge visual mostrando o número de requisições pendentes

### 0.1.2

- [bicheichane:feature/dedicated-view-panel](https://github.com/jraylan/seamless-agent/pull/4)

#### Adicionado

- **Painel Dedicado**: Novo painel "Seamless Agent" registrado na área do painel inferior (junto com Terminal/Output), fornecendo um espaço de trabalho não intrusivo para interações com o agente
- **Renderização Markdown Completa**: Suporte completo a Markdown incluindo:
  - Headers, negrito, itálico, tachado
  - Blocos de código com **syntax highlighting** para 10 linguagens: JavaScript/TypeScript, Python, C#, Java, CSS, HTML/XML, JSON, Bash/Shell, SQL
  - Citações em bloco, listas ordenadas e não ordenadas
  - Links (auto-linkified), tabelas
- **Input Multi-Linha**: Elemento `<textarea>` permite escrever respostas detalhadas, colar trechos de código e usar `Ctrl+Enter` para enviar
- **Notificações Não-Intrusivas**:
  - Indicador badge na aba do painel mostrando contagem de requisições pendentes
  - Notificação informativa como alerta suplementar com ação "Abrir Console"
  - Painel auto-revela mas preserva o foco (`preserveFocus: true`)
- **Fallback Gracioso**: Se o painel webview não estiver disponível, a ferramenta automaticamente volta para a abordagem de diálogos do VS Code

#### Alterado

- Movida UI de confirmação de diálogos popup para painel dedicado
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
