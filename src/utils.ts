import { execSync } from 'child_process';
import { createWriteStream, existsSync, unlink } from 'fs-extra';
import { delimiter, isAbsolute, join } from 'path';
import * as msg from './qore_message';

export function compareVersion(v1, v2) {
    if ((typeof v1 !== 'string') || (typeof v2 !== 'string')) {
        return undefined;
    }
    v1 = v1.split('.');
    v2 = v2.split('.');
    const k = Math.min(v1.length, v2.length);
    for (let i = 0; i < k; ++ i) {
        v1[i] = parseInt(v1[i], 10);
        v2[i] = parseInt(v2[i], 10);
        if (v1[i] > v2[i]) {
            return 1;
        }
        if (v1[i] < v2[i]) {
            return -1;
        }
    }
    return v1.length == v2.length ? 0: (v1.length < v2.length ? -1 : 1);
}

export function findScript(extensionPath: string, scriptName: string): string {
    if (isAbsolute(scriptName)) {
        return scriptName;
    }
    // try extension directory
    let s = join(extensionPath, scriptName);
    if (existsSync(s)) {
        return s;
    }
    // try PATH environment variable
    const pathArr = (process.env.PATH || "").split(delimiter);
    for (let p of pathArr) {
        s = join(p, scriptName);
        if (existsSync(s)) {
            return s;
        }
    }
    return scriptName;
}

//! open an URL in the browser
export function openInBrowser(url: string) {
    // open it in external tool - system should find appropriate handlers for schemas
    // vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
    let executable: string;
    switch (process.platform) {
        case 'aix':
        case 'freebsd':
        case 'linux':
        case 'openbsd':
        case 'sunos':
            executable = 'xdg-open';
            break;
        case 'darwin':
            executable = 'open';
            break;
        case 'win32':
            executable = 'start';
            break;
        default:
            executable = '';
    }
    const command: string = executable + ' ' + url;
    try {
        execSync(command);
    }
    catch (e) {
        msg.logPlusConsole(e);
    }
}

export function downloadFile(uri: string, dest: string, onSuccess, onError) {
    const url = require('url');
    const https = require('https');
    const http = require('http');

    let protocol = url.parse(uri).protocol.slice(0, -1);
    let file = createWriteStream(dest);

    let localOnError = function(error) {
        msg.logPlusConsole("error: " + error);
        unlink(dest, err => { onError(err); }); // Delete the file async. (But we don't check the result)
        onError(error);
    };

    let dloadFunc = function(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
            file.on('error', localOnError);
            file.on('finish', function() {
                //msg.logPlusConsole("Download success");
                file.end();  // close() is async, call cb after close completes.
                onSuccess();
            });
            response.pipe(file);
        } else if (response.headers.location) { // handle redirect
            downloadFile(response.headers.location, dest, onSuccess, onError);
        } else {
            localOnError(new Error("Server error: " + response));
        }
    };

    if (protocol == "https") {
        https.get(uri, dloadFunc).on('error', localOnError);
    }
    else if (protocol == "http") {
        http.get(uri, dloadFunc).on('error', localOnError);
    }
}
