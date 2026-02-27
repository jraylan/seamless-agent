
import type { LogLevel, VSCodeAPI } from "../types";

export interface WebviewLogger {
    log: (...message: any[]) => void;
    info: (...message: any[]) => void;
    warn: (...message: any[]) => void;
    error: (...message: any[]) => void;
    debug: (...message: any[]) => void;
}


let logger: WebviewLogger | null = null;

export function getLogger(vscode: VSCodeAPI): WebviewLogger {
    if (!logger) {
        const _postLogMessage = (level: LogLevel, ...message: any[]) => {
            vscode.postMessage({ type: 'log', level, message });
        }

        logger = {
            log: (...message: any[]) => _postLogMessage('debug', ...message),
            debug: (...message: any[]) => _postLogMessage('debug', ...message),
            info: (...message: any[]) => _postLogMessage('info', ...message),
            warn: (...message: any[]) => _postLogMessage('warn', ...message),
            error: (...message: any[]) => _postLogMessage('error', ...message)
        };
    }
    return logger;
}
