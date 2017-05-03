'use strict';

import * as path from 'path';
import * as child_process from 'child_process';

import { workspace, Disposable, ExtensionContext, window } from 'vscode';
import { LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind } from 'vscode-languageclient';

export function activate(context: ExtensionContext) {
    console.log('Activating qore-vscode extension');

    // Command-line arguments
    let serverArgs = ['/path/to/qls.q'];
    let debugServerArgs = ['/path/to/qls.q'];
    /*let serverOpts = {
        cwd: path.join('path', 'something', 'else'),
        env: {
            OMQ_DIR: path.join(),
            HOME: process.env.HOME ? process.env.HOME : '/something'
        }
    };*/

    // Language server options
    let serverOptions: ServerOptions;
    let DEV_MODE = true;
    if (DEV_MODE) {
        serverOptions = () => new Promise<child_process.ChildProcess>((resolve, reject) => {
            function spawnServer(...args: string[]): child_process.ChildProcess {
                //let childProcess = child_process.spawn('qls.q');
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
                workspace.createFileSystemWatcher('**/*.qjob')
            ]
        }
    }

    // Create the language client and start the client.
    let lc = new LanguageClient('qls', 'Qore Language Server', serverOptions, clientOptions);
    let disposable = lc.start();
    console.log('Started qls');

    // Push the disposable to the context's subscriptions so that the 
    // client can be deactivated on extension deactivation
    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}
