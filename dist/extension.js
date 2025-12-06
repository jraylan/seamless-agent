"use strict";var W=Object.create;var f=Object.defineProperty;var $=Object.getOwnPropertyDescriptor;var N=Object.getOwnPropertyNames;var O=Object.getPrototypeOf,E=Object.prototype.hasOwnProperty;var q=t=>e=>{var s=t[e];if(s)return s();throw new Error("Module not found in bundle: "+e)};var w=(t,e)=>()=>(e||t((e={exports:{}}).exports,e),e.exports),L=(t,e)=>{for(var s in e)f(t,s,{get:e[s],enumerable:!0})},y=(t,e,s,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let o of N(e))!E.call(t,o)&&o!==s&&f(t,o,{get:()=>e[o],enumerable:!(n=$(e,o))||n.enumerable});return t};var b=(t,e,s)=>(s=t!=null?W(O(t)):{},y(e||!t||!t.__esModule?f(s,"default",{value:t,enumerable:!0}):s,t)),j=t=>y(f({},"__esModule",{value:!0}),t);var C=w((Z,F)=>{F.exports={"notification.confirmationRequired":"Confirma\xE7\xE3o Necess\xE1ria","notification.agentRequiresInput":"O agente precisa da sua entrada","notification.openConsole":"Abrir Console","button.respond":"Responder","button.submit":"Enviar","button.cancel":"Cancelar","input.placeholder":"Digite sua resposta aqui...","console.title":"Seamless Agent","console.noPendingRequests":"Nenhuma solicita\xE7\xE3o pendente.","console.yourResponse":"Sua resposta:","badge.inputRequired":"Entrada Necess\xE1ria"}});var P=w((ee,V)=>{V.exports={"notification.confirmationRequired":"Confirma\xE7\xE3o Necess\xE1ria","notification.agentRequiresInput":"O agente necessita da sua resposta","notification.openConsole":"Abrir Consola","button.respond":"Responder","button.submit":"Submeter","button.cancel":"Cancelar","input.placeholder":"Escreva a sua resposta aqui...","console.title":"Seamless Agent","console.noPendingRequests":"Sem pedidos pendentes.","console.yourResponse":"A sua resposta:","badge.inputRequired":"Resposta Necess\xE1ria"}});var _=w((ne,D)=>{D.exports={"notification.confirmationRequired":"Confirmation Required","notification.agentRequiresInput":"Agent requires your input","notification.openConsole":"Open Console","button.respond":"Respond","button.submit":"Submit","button.cancel":"Cancel","input.placeholder":"Type your response here...","console.title":"Seamless Agent","console.noPendingRequests":"No pending requests.","console.yourResponse":"Your response:","badge.inputRequired":"Input Required"}});var G={};L(G,{activate:()=>J,deactivate:()=>z});module.exports=j(G);var r=b(require("vscode"));var l=b(require("vscode"));var T=b(require("vscode"));var B=q({"../package.nls.pt-br.json":()=>C(),"../package.nls.pt.json":()=>P()});var U=JSON.parse(JSON.stringify(_()));try{let t=T.env.language;if(t&&t!=="en"){let e=B(`../package.nls.${t}.json`);Object.assign(U,e)}}catch{}function c(t,...e){let s=U[t]||t;return e.forEach((n,o)=>{s=s.replace(`{${o}}`,String(n))}),s}var i={get confirmationRequired(){return c("notification.confirmationRequired")},get agentRequiresInput(){return c("notification.agentRequiresInput")},get openConsole(){return c("notification.openConsole")},get respond(){return c("button.respond")},get submit(){return c("button.submit")},get cancel(){return c("button.cancel")},get inputPlaceholder(){return c("input.placeholder")},get consoleTitle(){return c("console.title")},get noPendingRequests(){return c("console.noPendingRequests")},get yourResponse(){return c("console.yourResponse")},get inputRequired(){return c("badge.inputRequired")}};function x(t,e){let s=l.lm.registerTool("ask_user",{async invoke(n,o){let u=n.input,p=u.question,m=u.title||i.confirmationRequired,g=await H(e,p,m);return new l.LanguageModelToolResult([new l.LanguageModelTextPart(JSON.stringify({responded:g.responded,response:g.response}))])}});t.subscriptions.push(s)}async function H(t,e,s){let n=await t.waitForUserResponse(e,s);return!n.responded&&n.response==="Agent Console view is not available."?Y(e,s):n}async function Y(t,e){let s=i.respond;if(await l.commands.executeCommand("workbench.action.focusActiveEditorGroup"),await l.window.showWarningMessage(`${i.confirmationRequired}: ${t}`,{modal:!1},s)!==s)return{responded:!1,response:""};let o=await l.window.showInputBox({title:e,prompt:t,placeHolder:i.inputPlaceholder,ignoreFocusOut:!0});return o===void 0?{responded:!1,response:""}:{responded:o.trim().length>0,response:o}}var d=b(require("vscode"));var h=class{constructor(e){this._extensionUri=e}static viewType="seamlessAgentView";_view;_pendingRequest=null;resolveWebviewView(e,s,n){this._view=e,e.webview.options={enableScripts:!0,localResourceRoots:[d.Uri.joinPath(this._extensionUri,"media"),d.Uri.joinPath(this._extensionUri,"dist")]},e.webview.html=this._getHtmlContent(e.webview),e.webview.onDidReceiveMessage(o=>{this._handleWebviewMessage(o)},void 0,[]),e.onDidDispose(()=>{this._resolvePendingRequest({responded:!1,response:"View was closed"})})}async waitForUserResponse(e,s){return this._pendingRequest?{responded:!1,response:"Another request is already pending."}:this._view?new Promise(n=>{this._pendingRequest={resolve:n},this.showQuestion(e,s||i.confirmationRequired),this._setBadge(1),this._view?.show(!0),this._showNotification()}):{responded:!1,response:"Agent Console view is not available."}}showQuestion(e,s){let n={type:"showQuestion",question:e,title:s};this._view?.webview.postMessage(n)}clear(){let e={type:"clear"};this._view?.webview.postMessage(e)}_handleWebviewMessage(e){switch(e.type){case"submit":console.log("[AgentInteractionProvider] Submit received:",e.response),this._resolvePendingRequest({responded:!0,response:e.response});break;case"cancel":console.log("[AgentInteractionProvider] Cancel received"),this._resolvePendingRequest({responded:!1,response:""});break}}_resolvePendingRequest(e){this._pendingRequest&&(this._pendingRequest.resolve(e),this._pendingRequest=null,this._setBadge(0))}_setBadge(e){this._view&&(this._view.badge=e>0?{value:e,tooltip:i.inputRequired}:void 0)}_showNotification(){d.window.showInformationMessage(i.agentRequiresInput,i.openConsole).then(e=>{e===i.openConsole&&d.commands.executeCommand("seamlessAgentView.focus")})}_getHtmlContent(e){let s=e.asWebviewUri(d.Uri.joinPath(this._extensionUri,"media","main.css")),n=e.asWebviewUri(d.Uri.joinPath(this._extensionUri,"media","highlight.css")),o=e.asWebviewUri(d.Uri.joinPath(this._extensionUri,"dist","webview.js")),u=this._getNonce();return`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${e.cspSource} 'unsafe-inline'; script-src 'nonce-${u}';">
    <link href="${s}" rel="stylesheet">
    <link href="${n}" rel="stylesheet">
    <title>${i.consoleTitle}</title>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${i.consoleTitle}</h1>
        </div>
        
        <!-- Empty state - shown when no request pending -->
        <div id="empty-state">
            <p class="placeholder">${i.noPendingRequests}</p>
        </div>
        
        <!-- Request form - hidden until a question arrives -->
        <div id="request-form" class="hidden">
            <div class="question-section">
                <div class="question-title" id="question-title">${i.confirmationRequired}</div>
                <div class="question-content" id="question-content"></div>
            </div>
            
            <div class="response-section">
                <label class="response-label" for="response-input">${i.yourResponse}</label>
                <textarea 
                    id="response-input" 
                    placeholder="${i.inputPlaceholder}"
                    rows="5"
                ></textarea>
            </div>
            
            <div class="button-group">
                <button type="button" id="submit-btn" class="btn-primary">${i.submit}</button>
                <button type="button" id="cancel-btn" class="btn-secondary">${i.cancel}</button>
            </div>
        </div>
    </div>
    
    <script nonce="${u}" src="${o}"></script>
</body>
</html>`}_getNonce(){let e="",s="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let n=0;n<32;n++)e+=s.charAt(Math.floor(Math.random()*s.length));return e}};var Q="seamless-agent.agent";function J(t){console.log("Seamless Agent extension active");let e=new h(t.extensionUri);t.subscriptions.push(r.window.registerWebviewViewProvider(h.viewType,e,{webviewOptions:{retainContextWhenHidden:!0}})),x(t,e);let s=async(o,u,p,m)=>{let g=r.lm.tools.find(a=>a.name==="ask_user"),M=g?[g]:[],I=[r.LanguageModelChatMessage.User(`You are a helpful assistant. 
IMPORTANT: You have access to an "ask_user" tool. You MUST use this tool before completing any task to confirm with the user that their request was fulfilled correctly.
Never finish a response without first calling the ask_user tool to verify with the user.`),r.LanguageModelChatMessage.User(o.prompt)],k=o.model,A={tools:M.map(a=>({name:a.name,description:a.description,inputSchema:a.inputSchema}))};try{let a=await k.sendRequest(I,A,m);for await(let v of a.stream)if(v instanceof r.LanguageModelTextPart)p.markdown(v.value);else if(v instanceof r.LanguageModelToolCallPart){p.progress(`Calling ${v.name}...`);let S=await r.lm.invokeTool(v.name,{input:v.input,toolInvocationToken:o.toolInvocationToken},m);for(let R of S.content)R instanceof r.LanguageModelTextPart&&p.markdown(`

**User Response:** ${R.value}

`)}}catch(a){if(a instanceof r.LanguageModelError)p.markdown(`Error: ${a.message}`);else throw a}},n=r.chat.createChatParticipant(Q,s);n.iconPath=new r.ThemeIcon("question"),t.subscriptions.push(n)}function z(){}0&&(module.exports={activate,deactivate});
