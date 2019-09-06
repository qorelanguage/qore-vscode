import { window } from 'vscode';


export const output = window.createOutputChannel('Qore');

export function logPlusConsole(text: string, with_newline: boolean = true) {
    console.log(text);
    with_newline ? output.appendLine(text) : output.append(text);
}

export function log(text: string, with_newline: boolean = true) {
    with_newline ? output.appendLine(text) : output.append(text);
}

export function info(text: string, log_too: boolean = true) {
    console.log(text);
    window.showInformationMessage(text).then(() => {}, () => {});
    if (log_too) {
        log(text);
    }
}

export function warning(text: string, log_too: boolean = true) {
    console.log(text);
    window.showWarningMessage(text).then(() => {}, () => {});
    if (log_too) {
        log(text);
    }
}

export function error(text: string, log_too: boolean = true) {
    console.log(text);
    window.showErrorMessage(text).then(() => {}, () => {});
    if (log_too) {
        log(text);
    }
}

