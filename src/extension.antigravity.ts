import * as vscode from 'vscode';
import { ExtensionCore } from './core';



export function activate(context: vscode.ExtensionContext) {
    console.log('Seamless Agent extension active');
    const core = new ExtensionCore(context);
    context.subscriptions.push(core);
}

export function deactivate() {
    console.log('Seamless Agent extension deactivated');
}