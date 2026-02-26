import * as vscode from 'vscode';
import * as util from 'util';


const outputChannel = vscode.window.createOutputChannel("Seamless Agent");

const log = (level: vscode.LogLevel, ...args: any[]) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${vscode.LogLevel[level]}] `;
    outputChannel.append(logEntry);
    outputChannel.append(util.format(...args));
    outputChannel.appendLine('');
}


type LogLevelStr = 'info' | 'warn' | 'error' | 'debug';

export class Logger {

    static logWithLevel(level: LogLevelStr, ...args: any[]) {
        let logLevel: vscode.LogLevel;
        switch (level) {
            case 'debug':
                logLevel = vscode.LogLevel.Debug;
                break;
            case 'warn':
                logLevel = vscode.LogLevel.Warning;
                break;
            case 'error':
                logLevel = vscode.LogLevel.Error;
                break;
            default:
                logLevel = vscode.LogLevel.Info;
                break
        }
        log(logLevel, ...args);
    }

    static log(...args: any[]) {
        log(vscode.LogLevel.Info, ...args);
    }

    static debug(...args: any[]) {
        log(vscode.LogLevel.Debug, ...args);
    }

    static warn(...args: any[]) {
        log(vscode.LogLevel.Warning, ...args);
    }

    static info(...args: any[]) {
        log(vscode.LogLevel.Info, ...args);
    }

    static error(...args: any[]) {
        log(vscode.LogLevel.Error, ...args);
    }

    static clear() {
        outputChannel.clear();
    }

    static show() {
        outputChannel.show();
    }
}
