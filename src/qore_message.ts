import { window } from 'vscode';


export const output = window.createOutputChannel('Qore');

export function logPlusConsole(text: string, withNewline: boolean = true) {
    console.log(text);
    withNewline ? output.appendLine(text) : output.append(text);
}

export function log(text: string, withNewline: boolean = true) {
    withNewline ? output.appendLine(text) : output.append(text);
}

export function info(text: string, logToo: boolean = true) {
    console.log(text);
    window.showInformationMessage(text).then(() => {}, () => {});
    if (logToo) {
        log(text);
    }
}

export function warning(text: string, logToo: boolean = true) {
    console.log(text);
    window.showWarningMessage(text).then(() => {}, () => {});
    if (logToo) {
        log(text);
    }
}

export function error(text: string, logToo: boolean = true) {
    console.log(text);
    window.showErrorMessage(text).then(() => {}, () => {});
    if (logToo) {
        log(text);
    }
}

