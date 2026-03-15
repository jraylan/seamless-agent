import * as util from 'util';

let vscode: any = null;
let outputChannel: any = null;

// Lazy load vscode only when needed
const getVscode = () => {
    if (!vscode) {
        try {
            vscode = require('vscode');
        } catch (err) {
            // vscode not available (e.g., in tests) - use a no-op mock
            vscode = {
                window: {
                    createOutputChannel: () => ({
                        append() { },
                        appendLine() { },
                        clear() { },
                        show() { },
                    })
                },
                LogLevel: {
                    Debug: 0,
                    Info: 1,
                    Warning: 2,
                    Error: 3
                }
            };
        }
    }
    return vscode;
};

const getOutputChannel = (): any => {
    if (!outputChannel) {
        const vs = getVscode();
        outputChannel = vs.window.createOutputChannel("Seamless Agent");
    }
    return outputChannel;
};

const log = (level: number, ...args: any[]) => {
    const channel = getOutputChannel();
    const vs = getVscode();
    const timestamp = new Date().toISOString();
    const levelName = Object.keys(vs.LogLevel).find((key) => vs.LogLevel[key] === level) || 'INFO';
    const logEntry = `[${timestamp}] [${levelName}] `;
    channel.append(logEntry);
    channel.append(util.format(...args));
    channel.appendLine('');
}


type LogLevelStr = 'info' | 'warn' | 'error' | 'debug';

export class Logger {

    static logWithLevel(level: LogLevelStr, ...args: any[]) {
        const vs = getVscode();
        let logLevel: number;
        switch (level) {
            case 'debug':
                logLevel = vs.LogLevel.Debug;
                break;
            case 'warn':
                logLevel = vs.LogLevel.Warning;
                break;
            case 'error':
                logLevel = vs.LogLevel.Error;
                break;
            default:
                logLevel = vs.LogLevel.Info;
                break
        }
        log(logLevel, ...args);
    }

    static log(...args: any[]) {
        const vs = getVscode();
        log(vs.LogLevel.Info, ...args);
    }

    static debug(...args: any[]) {
        const vs = getVscode();
        log(vs.LogLevel.Debug, ...args);
    }

    static warn(...args: any[]) {
        const vs = getVscode();
        log(vs.LogLevel.Warning, ...args);
    }

    static info(...args: any[]) {
        const vs = getVscode();
        log(vs.LogLevel.Info, ...args);
    }

    static error(...args: any[]) {
        const vs = getVscode();
        log(vs.LogLevel.Error, ...args);
    }

    static clear() {
        const channel = getOutputChannel();
        channel.clear();
    }

    static show() {
        const channel = getOutputChannel();
        channel.show();
    }

    // Badge-specific logging with structured output
    static badge(...args: any[]) {
        const timestamp = new Date().toISOString();
        const vs = getVscode();
        log(vs.LogLevel.Info, `[BADGE] ${timestamp}`, ...args);
    }

    static badgeDebug(...args: any[]) {
        const timestamp = new Date().toISOString();
        const vs = getVscode();
        log(vs.LogLevel.Debug, `[BADGE-DEBUG] ${timestamp}`, ...args);
    }
}

