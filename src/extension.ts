'use strict';

import * as path from 'path';
import * as vscode from 'vscode';
import * as child_process from 'child_process';

import { workspace, Disposable, ExtensionContext, window } from 'vscode';
import { LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind } from 'vscode-languageclient';

export function activate(context: ExtensionContext) {
    console.log('Activating qore-vscode extension');

    // Find out if Qore and the astparser module are present.
    let results = child_process.spawnSync("qore", ["-ne", "%requires astparser\n%requires json\nint x = 1; x++;"]);
    let qlsOk = false;
    if (results.status == 0)
        qlsOk = true;

    // Language server command-line arguments
    let extensionDir = vscode.extensions.getExtension("qoretechnologies.qore-vscode").extensionPath;
    let serverArgs = [extensionDir + '/qls/qls.q'];
    let debugServerArgs = [extensionDir + '/qls/qls.q'];

    // Language server options
    let serverOptions: ServerOptions;
    let DEV_MODE = false;
    if (DEV_MODE) {
        serverOptions = () => new Promise<child_process.ChildProcess>((resolve, reject) => {
            function spawnServer(...args: string[]): child_process.ChildProcess {
                let childProcess = child_process.spawn('qore', serverArgs);
                childProcess.stderr.on('data', data => { console.log(`stderr: ${data}`); });
                childProcess.stdout.on('data', data => { console.log(`stdout: ${data}`); });
                return childProcess; // Uses stdin/stdout for communication
            }

            resolve(spawnServer())
        });
    }
    else {
        serverOptions = {
            run: {command: 'qore', args: serverArgs/*, opts: serverOpts */},
            debug: {command: 'qore', args: debugServerArgs/*, opts: debugServerOpts */}
        }
    }

    // Options to control the language client
    let clientOptions: LanguageClientOptions = {
        // Docs regarding documentSelector:
        // https://code.visualstudio.com/Docs/extensionAPI/vscode-api#DocumentSelector
        // https://code.visualstudio.com/Docs/extensionAPI/vscode-api#DocumentFilter
        documentSelector: ['qore'],
        synchronize: {
            // Synchronize the setting section 'qore' to the server
            configurationSection: 'qore',
            // Notify the server about file changes to qore files contained in the workspace
            fileEvents: [
                workspace.createFileSystemWatcher('**/*.q'),
                workspace.createFileSystemWatcher('**/*.qm'),
                workspace.createFileSystemWatcher('**/*.qtest'),
                workspace.createFileSystemWatcher('**/*.ql'),
                workspace.createFileSystemWatcher('**/*.qc'),
                workspace.createFileSystemWatcher('**/*.qsd'),
                workspace.createFileSystemWatcher('**/*.qfd'),
                workspace.createFileSystemWatcher('**/*.qwf'),
                workspace.createFileSystemWatcher('**/*.qjob'),
                workspace.createFileSystemWatcher('**/*.qclass'),
                workspace.createFileSystemWatcher('**/*.qconst'),
                workspace.createFileSystemWatcher('**/*.qsm'),
                workspace.createFileSystemWatcher('**/*.qconn')
            ]
        }
    }

    let lc = new LanguageClient('qls', 'Qore Language Server', serverOptions, clientOptions);
    let disposable;

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
    }
}

// this method is called when your extension is deactivated
export function deactivate() {
}
