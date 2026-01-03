Este diretório contém o **contrato público** (interfaces) consumido por extensões **addon**.

## Como um addon obtém a API do Seamless Agent

No `activate()` do seu addon, obtenha a extensão e chame `activate()` para receber o objeto de API:

- Extensão: `jraylan.seamless-agent`
- API: `ISeamlessAgentAPI`

### Exemplo (addon)

- Busque a extensão pelo ID
- Ative-a para obter a API
- Registre o addon com `registerAddon()`

> Recomendação: use `import type { ISeamlessAgentAPI, IAddon } from '...';` (tipos) e mantenha a integração em runtime via `vscode.extensions.getExtension(...).activate()`.

## O que a API oferece

### UI

- **Tabs**: `api.ui.registerTab(tab)` permite criar novas abas no webview do Seamless Agent.
- **Histórico**: `api.ui.registerHistoryProvider(provider)` permite injetar itens/tipos adicionais no histórico.
- **Settings**: `api.ui.registerSettingsSection(section)` permite adicionar seções de configuração na aba Settings do webview.

### Tools (LLM)

- Defina ferramentas em `addon.ai.tools` (ver `IAddonTool`).
- O Seamless Agent expõe e executa essas ferramentas no contexto do agente.

### Storage

- `api.storage` fornece persistência (namespaced) para o addon armazenar preferências e dados.

### Events

- `api.events` permite observar eventos do Seamless Agent (ex.: refresh de UI, tool executada, etc.).

## Compatibilidade

A API expõe `api.version`. Addons devem validar a versão para garantir compatibilidade.

## Importante (types-only)

Este repositório gera um pacote separado (para NPM) contendo **somente typedefs** para uso por addons.
Evite depender de implementações deste diretório no runtime do addon.
