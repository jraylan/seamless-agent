/**
 * Shim para `@vscode/codicons/dist/codiconsLibrary`.
 *
 * Motivo:
 * - O pacote `@vscode/codicons` referencia arquivos `.js` internos (ex.: `codiconsUtil.js`)
 *   que nem sempre vêm acompanhados de declarações de tipo resolvíveis pelo `tsc`.
 * - Para gerar um pacote *types-only* dos contratos públicos do Seamless Agent,
 *   basta sabermos que `codiconsLibrary` é um objeto indexável.
 */

declare module '@vscode/codicons/dist/codiconsLibrary' {
    export const codiconsLibrary: Record<string, unknown>;
}
