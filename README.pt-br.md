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
- **Colar Imagens** — Cole imagens diretamente na área de entrada para contexto
- **Referências e Anexos** — Referencie arquivos do seu workspace usando `#nomedoarquivo` e anexe arquivos à sua resposta

### Ferramenta Approve Plan (`#approvePlan`)

Uma ferramenta de Language Model que apresenta um plano em um painel dedicado de revisão, para você aprovar ou pedir mudanças com comentários vinculados a partes específicas do plano.

- **Revisão de Plano** — Painel focado para ler o plano com calma
- **Feedback Direcionado** — Comente em títulos/parágrafos/itens de lista específicos
- **Retorno Estruturado** — Retorna `{ approved, comments: [{ citation, comment }] }` para o agente
- **Mais Segurança** — Evita execução antes da sua aprovação

## Como Usar

Após a instalação, as ferramentas `ask_user` e `approve_plan` estão automaticamente disponíveis para o GitHub Copilot Chat.

### Uso Automático

O Copilot usará automaticamente esta ferramenta quando precisar da sua confirmação. Quando acionada:

1. Uma notificação aparece no VS Code
2. Clique em "Responder" para abrir o diálogo de input
3. Digite sua resposta
4. O Copilot continua baseado na sua resposta

### Revisando um plano com `approve_plan`

O Copilot usará esta ferramenta quando quiser sua aprovação em um plano antes de prosseguir. Quando acionada:

1. Um painel “Review Plan” (Revisar Plano) abre no editor
2. Passe o mouse sobre um título/parágrafo/item de lista e clique no ícone de comentário para adicionar feedback
3. Clique em **Approve** para seguir, ou **Request Changes** para pedir ajustes
4. O Copilot continua com base em `{ approved, comments }`

## Dicas

### Prompt de Sistema Recomendado

Para garantir que a IA peça aprovação nos momentos certos, adicione o seguinte às suas instruções personalizadas ou prompt de sistema:

```
Quando a tarefa exigir múltiplos passos ou mudanças não triviais, apresente um plano detalhado usando #approvePlan e aguarde aprovação antes de executar.
Se o plano for rejeitado, incorpore os comentários e envie um plano atualizado com #approvePlan.
Sempre use #askUser antes de concluir qualquer tarefa para confirmar com o usuário que a solicitação foi atendida corretamente.
```

Você pode adicionar isso ao arquivo `.github/copilot-instructions.md` do seu projeto

### Tutorial rápido: usando `approve_plan`

Se você quiser forçar a revisão do plano desde o começo, peça algo como:

```
Antes de mudar qualquer coisa, escreva um plano passo a passo e apresente com #approvePlan.
Aguarde minha aprovação (ou pedidos de ajuste). Só então implemente o plano.
```

## Requisitos

- VS Code 1.106.1 ou superior
- Extensão GitHub Copilot Chat

## Configurações

Esta extensão funciona imediatamente sem necessidade de configuração.

## Problemas Conhecidos

Nenhum até o momento. Por favor, reporte problemas no [GitHub](https://github.com/jraylan/seamless-agent/issues).

## Notas de Versão

### 0.1.9

#### Adicionado

- **Autocompletar Referência de Arquivos**: Digite `#` na área de resposta para buscar e referenciar arquivos do workspace. Arquivos selecionados são automaticamente anexados e sincronizados com seu texto.
- **Chips de Anexos**: Anexos de arquivos agora são exibidos como chips visuais acima da área de texto para fácil gerenciamento.
- **Colar Imagens**: Cole imagens diretamente na área de entrada para anexá-las.
- **Botão de Anexar**: Novo botão 📎 para adicionar anexos de arquivos rapidamente via seletor de arquivos.

#### Alterado

- **Suporte a Imagens Inline**: Imagens coladas na ferramenta `ask_user` agora são passadas diretamente para a IA usando dados binários `LanguageModelDataPart.image()`, eliminando a necessidade de uma ferramenta separada de visualização de imagens.
- **Anexos Simplificados**: Formato de resposta de anexos simplificado para um array de strings de URIs de arquivos.
- **Nomenclatura de Imagens Simplificada**: Imagens coladas agora usam nomes simples (`image-pasted.png`, `image-pasted-1.png`) em vez de timestamps longos.
- **Referências de Arquivos Simplificadas**: Referências de arquivos agora usam formato `#nomedoarquivo` em vez de `#file:nomedoarquivo`.

### 0.1.8

#### Adicionado

- **Approve Plan**: Adicionada a ferramenta `approve_plan` (`#approvePlan`) para revisar/aprovar planos com comentários antes da execução (VSCode)

### 0.1.7

#### Corrigido

- **Webview**: Solucionado um problema onde o prompt fallback era aberto quando o Webview não recebeu o foco do usuário (VSCode)

#### Alterado

- **Documentação**: Adicionado instruções para usuários do Antigravity (Antigravity)

## 0.1.6

#### Corrigido

- **Antigravity**: Corrigido suporte ao Antigravity

### 0.1.5

#### Adicionado

- **Antigravity**: Adicionado suporte ao Antigravity

### 0.1.4

#### Corrigido

- **Contador de Requisições**: Corrigido badge que não resetava para 0 após todas as requisições serem fechadas (estava mostrando "1" incorretamente)
- **Comportamento de Notificação**: Notificações agora aparecem apenas quando o painel Seamless Agent não está visível, reduzindo interrupções quando o painel já está aberto

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
