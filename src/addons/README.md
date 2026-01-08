Este diretório contém o **sistema de addons** do Seamless Agent (registro, lifecycle e utilitários).

## Para autores de addons

Em geral, você **não** precisa importar nada daqui no seu addon.
Use a **API pública** exposta pela extensão Seamless Agent (ver `src/api`).

## Para contribuidores do Seamless Agent

- `registry.ts`: Registro central de addons (`AddonRegistry`) que mantém estado de ativação, tabs, settings e tools.
- `types.ts`: Aliases/re-exports de tipos do contrato público, para manter compatibilidade interna.

## Responsabilidades

O `AddonRegistry` agrega e organiza:

- **Tabs** registradas pelos addons
- **Seções de Settings** registradas pelos addons
- **Providers de histórico**
- **Tools** expostas pelos addons

O runtime do Seamless Agent usa o registry para alimentar a UI e a execução de ferramentas.
