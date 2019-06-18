import { window } from 'vscode';


export const output = window.createOutputChannel('Qore Development');

export function log(text: string, with_newline: boolean = true) {
    with_newline ? output.appendLine(text) : output.append(text);
}

export function info(text: string, log_too: boolean = true) {
    window.showInformationMessage(text);
    if (log_too) {
        log(text);
    }
}

export function warning(text: string, log_too: boolean = true) {
    window.showWarningMessage(text);
    if (log_too) {
        log(text);
    }
}

export function error(text: string, log_too: boolean = true) {
    window.showErrorMessage(text);
    if (log_too) {
        log(text);
    }
}

