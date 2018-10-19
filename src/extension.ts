'use strict';

import * as child_process from 'child_process';
import * as vscode from 'vscode';
import * as languageclient from 'vscode-languageclient';

export async function activate(context: vscode.ExtensionContext) {
    console.log('Activating qore-vscode extension');

    // Find out if Qore and the astparser module are present.
    let qore_executable: string = vscode.workspace.getConfiguration("qore").get("executable") || "qore";

    let results = child_process.spawnSync(qore_executable, ["-ne", "%requires astparser\n%requires json\nint x = 1; x++;"]);
    let qlsOk = false;
    if (results.status == 0) {
        qlsOk = true;
    }

    // Find out if QLS should run.
    let useQLS = vscode.workspace.getConfiguration("qore").get("useQLS");

    // Language server command-line arguments
    let extensionDir = context.extensionPath;
    let serverArgs = [extensionDir + '/qls/qls.q'];
    let debugServerArgs = [extensionDir + '/qls/qls.q'];

    // Language server options
    let serverOptions: languageclient.ServerOptions;
    let DEV_MODE = false;
    if (DEV_MODE) {
        serverOptions = () => new Promise<child_process.ChildProcess>((resolve) => {
            function spawnServer(): child_process.ChildProcess {
                let childProcess = child_process.spawn(qore_executable, serverArgs);
                childProcess.stderr.on('data', data => { console.log(`stderr: ${data}`); });
                childProcess.stdout.on('data', data => { console.log(`stdout: ${data}`); });
                return childProcess; // Uses stdin/stdout for communication
            }

            resolve(spawnServer());
        });
    }
    else {
        serverOptions = {
            run: {command: qore_executable, args: serverArgs/*, opts: serverOpts */},
            debug: {command: qore_executable, args: debugServerArgs/*, opts: debugServerOpts */}
        };
    }

    // Options to control the language client
    let clientOptions: languageclient.LanguageClientOptions = {
        // Docs regarding documentSelector:
        // https://code.visualstudio.com/Docs/extensionAPI/vscode-api#DocumentSelector
        // https://code.visualstudio.com/Docs/extensionAPI/vscode-api#DocumentFilter
        documentSelector: ['qore'],
        synchronize: {
            // Synchronize the setting section 'qore' to the server
            configurationSection: 'qore',
            // Notify the server about file changes to qore files contained in the workspace
            fileEvents: [
                vscode.workspace.createFileSystemWatcher('**/*.q'),
                vscode.workspace.createFileSystemWatcher('**/*.qm'),
                vscode.workspace.createFileSystemWatcher('**/*.qtest'),
                vscode.workspace.createFileSystemWatcher('**/*.ql'),
                vscode.workspace.createFileSystemWatcher('**/*.qc'),
                vscode.workspace.createFileSystemWatcher('**/*.qsd'),
                vscode.workspace.createFileSystemWatcher('**/*.qfd'),
                vscode.workspace.createFileSystemWatcher('**/*.qwf'),
                vscode.workspace.createFileSystemWatcher('**/*.qjob'),
                vscode.workspace.createFileSystemWatcher('**/*.qclass'),
                vscode.workspace.createFileSystemWatcher('**/*.qconst'),
                vscode.workspace.createFileSystemWatcher('**/*.qsm')
            ]
        }
    };

    let lc = new languageclient.LanguageClient('qls', 'Qore Language Server', serverOptions, clientOptions);
    let disposable;

    if (useQLS) {
        // Create the language client and start the client.
        if (qlsOk) {
            disposable = lc.start();
            console.log('Started QLS');

            // Push the disposable to the context's subscriptions so that the
            // client can be deactivated on extension deactivation
            context.subscriptions.push(disposable);
        }
        else {
            console.log("Qore and/or astparser module are not present -> won't run QLS");
            vscode.window.showWarningMessage("Qore or Qore's astparser module are not present. Qore language server will not be started.");
            open_in_browser("https://github.com/qorelanguage/qore/wiki/General-Source-and-Download-Info");
        }
    }
}

// this method is called when your extension is deactivated
export function deactivate() {
}

function open_in_browser(url: string) {
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
    let command: string = executable + ' "' + url +'"';
    try {
        child_process.execSync(command);
    }
    catch (e) {
        console.log(e);
    }
}