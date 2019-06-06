'use strict';

import * as child_process from 'child_process';
import * as vscode from 'vscode';
import * as languageclient from 'vscode-languageclient';
import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';

function findQoreScript(context: vscode.ExtensionContext, scriptName: string): string {
    if (path.isAbsolute(scriptName)) {
        return scriptName;
    }
    // try extension directory
    let s = path.join(context.extensionPath, scriptName);
    if (fs.existsSync(s)) {
        return s;
    }
    // try PATH environment variable
    const pathArr = (process.env.PATH || "").split(path.delimiter);
    for (let p of pathArr) {
        s = path.join(p, scriptName);
        if (fs.existsSync(s)) {
            return s;
        }
    }
    return scriptName;
}

// tutorial abouut "=>" https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions
export async function activate(context: vscode.ExtensionContext) {
    console.log('Activating qore-vscode extension');
    // "Converting circular structure to JSON" when using JSON.stringify()
    // util.inspect() is proposed fix but it has another issue so limit depth
    var util = require('util');
    console.log("QoreConfigurationProvider(context: "+ util.inspect(context, {depth: 1}));

    const qoreExecutable: string = vscode.workspace.getConfiguration("qore").get("executable") || "qore";
    console.log('Qore executable: '+qoreExecutable);

    // Find out if Qore and the astparser module are present.
    let results = child_process.spawnSync(qoreExecutable, ["-l astparser -l json -ne \"int x = 1; x++;\""], {shell: true});
    let qlsOk = false;
    if (results.status == 0) {
        qlsOk = true;
    }

    // Find out if QLS should run.
    let useQLS = vscode.workspace.getConfiguration("qore").get("useQLS");

    // Language server command-line arguments
    let serverArgs = [findQoreScript(context, path.join("qls", "qls.q"))];
    let debugServerArgs = serverArgs;
    // Language server options
    let serverOptions: languageclient.ServerOptions;
    let DEV_MODE = false;
    if (DEV_MODE) {
        serverOptions = () => new Promise<child_process.ChildProcess>((resolve) => {
            function spawnServer(): child_process.ChildProcess {
                let childProcess = child_process.spawn(qoreExecutable, serverArgs, {shell: true});
                childProcess.stderr.on('data', data => { console.log(`stderr: ${data}`); });
                childProcess.stdout.on('data', data => { console.log(`stdout: ${data}`); });
                return childProcess; // Uses stdin/stdout for communication
            }

            resolve(spawnServer());
        });
    }
    else {
        serverOptions = {
            run: {command: qoreExecutable, args: serverArgs/*, opts: serverOpts */},
            debug: {command: qoreExecutable, args: debugServerArgs/*, opts: debugServerOpts */}
        };
    }

    // Options to control the language client
    let clientOptions: languageclient.LanguageClientOptions = {
        // Docs regarding documentSelector:
        // https://code.visualstudio.com/Docs/extensionAPI/vscode-api#DocumentSelector
        // https://code.visualstudio.com/Docs/extensionAPI/vscode-api#DocumentFilter
        documentSelector: [{scheme: 'file', language: 'qore'}],
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
            open_in_browser("https://github.com/qorelanguage/qore-vscode/wiki/Visual-Code-for-Qore-Language-Setup");
        }
    }

    // modify debugAdapter to "/qvscdbg-test" and executable to "bash" just in case the adapter silently won't start and check command it log
    let debugAdapter = findQoreScript(context, vscode.workspace.getConfiguration("qore").get("debugAdapter") || "qdbg-vsc-adapter");
    results = child_process.spawnSync(qoreExecutable, [debugAdapter, "-h"], {shell: true});
    if (results.status != 1) {
        console.log("Adapter [" + debugAdapter + "] not found, Debugging support is disabled");
        return;
    }

    // activate debugger stuff
    context.subscriptions.push(vscode.commands.registerCommand('extension.qore-vscode.getFilename', config => {
        console.log("extension.qore-vscode.getFilename(config:"+JSON.stringify(config)+")");
        // show input box is invoded async in executeCommandVariables so result of command is a Thenable object
        return vscode.window.showInputBox({
            //prompt: "",
            placeHolder: "Please enter the name of a Qore file in the workspace folder",
            value: "script.q"
        });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('extension.qore-vscode.getConnection', config => {
        console.log("extension.qore-vscode.getConnection(config:"+JSON.stringify(config)+")");
        return vscode.window.showInputBox({
            placeHolder: "Please enter the connection name to Qore debug server",
            value: "ws://localhost:8001/debug"
        });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('extension.qore-vscode.getProgram', config => {
        console.log("extension.qore-vscode.getProgram(config:"+JSON.stringify(config)+")");
        return vscode.window.showInputBox({
            placeHolder: "Please enter the name of a Qore program or program id",
            value: "my-job"
        });
    }));

    // register a configuration provider for 'qore' debug type
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('qore', new QoreConfigurationProvider(qoreExecutable, debugAdapter)));

    context.subscriptions.push(vscode.debug.onDidStartDebugSession(session => {
        console.log("extension.qore-vscode.onDidStartDebugSession(session:"+JSON.stringify(session)+")");
    }));
    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(session => {
        console.log("extension.qore-vscode.onDidTerminateDebugSession(session:"+JSON.stringify(session)+")");
    }));
    context.subscriptions.push(vscode.debug.onDidChangeActiveDebugSession(session => {
        console.log("extension.qore-vscode.onDidChangeActiveDebugSession(session:" + JSON.stringify(session) + ")");
    }));
    context.subscriptions.push(vscode.debug.onDidReceiveDebugSessionCustomEvent(event => {
        console.log("extension.qore-vscode.onDidReceiveDebugSessionCustomEvent(event:" + JSON.stringify(event) + ")");
    }));
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
    let command: string = executable + ' ' + url;
    try {
        child_process.execSync(command);
    }
    catch (e) {
        console.log(e);
    }
}

// debugger stuff
class QoreConfigurationProvider implements vscode.DebugConfigurationProvider {
    private _executable: string;
    private _debugAdapter: string;
    private _args: string[] = [];

    constructor (executable: string, debugAdapter: string) {
        this._executable = executable;
        this._debugAdapter = debugAdapter;
    }

    /**
        Massage a debug configuration just before a debug session is being launched,
        e.g. add all missing attributes to the debug configuration.
        Commands ${command:xxx} are invoked by vscode and value is substituted
     */
    resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {
        console.log("resolveDebugConfiguration(folder: "+JSON.stringify(folder)+", config:"+JSON.stringify(config)+", token:"+JSON.stringify(token)+")");
        // if launch.json is missing or empty
        if (!config.type && !config.request && !config.name) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'qore' ) {
                config.type = 'qore';
                config.name = 'Launch';
                config.request = 'launch';
                config.program = '${file}';
                config.stopOnEntry = true;  // TODO: not yet supported
            }
        }
        this._args = [this._debugAdapter];
        if (config.request === 'attach') {
            if (!config.connection) {
                return vscode.window.showInformationMessage("Connection string not specified").then(_ => {
                    return undefined;	// abort launch
                });
            }
            this._args.push("--attach");
            this._args.push(config.connection);
            if (!config.program) {
                return vscode.window.showInformationMessage("Program name or id is not specified").then(_ => {
                    return undefined;	// abort launch
                });
            }
            if (config.proxy) {
                this._args.push("--proxy");
                this._args.push(config.proxy);
            }
            if (typeof config.maxRedir !== "undefined") {
                this._args.push("--max-redir");
                this._args.push(config.maxRedir);
            }
            if (typeof config.timeout !== "undefined") {
                this._args.push("--timeout");
                this._args.push(config.timeout);
            }
            if (typeof config.connTimeout !== "undefined") {
                this._args.push("--conn-timeout");
                this._args.push(config.connTimeout);
            }
            if (typeof config.respTimeout !== "undefined") {
                this._args.push("--resp-timeout");
                this._args.push(config.respTimeout);
            }
            if (typeof config.headers !== "undefined") {
                for (var _hdr of config.headers) {
                    if (typeof _hdr.name !== "string" || typeof _hdr.value !== "string") {
                        return vscode.window.showInformationMessage("Wrong name or value for a header in: "+JSON.stringify(_hdr)).then(_ => {
                            return undefined;	// abort launch
                        });
                    }
                    this._args.push("--header");
                    this._args.push(_hdr.name + "=" + _hdr.value);
                }
            }
        } else {
            if (!config.program) {
                return vscode.window.showInformationMessage("Cannot find a program to debug").then(_ => {
                    return undefined;	// abort launch
                });
            }
            if (config.define) {
                for (let _s in config.define) {
                    this._args.push("--define");
                    this._args.push(config.define[_s]);
                }
            }
            if (config.parseOptions) {
                for (let _s in config.parseOptions) {
                    this._args.push("--set-parse-option");
                    this._args.push(config.parseOptions[_s]);
                }
            }
            if (config.timeZone) {
                this._args.push("--time-zone");
                this._args.push(config.timeZone);
            }
        }
        if (config.fullException) {
            this._args.push("--full-exception");
        }
        if (config.logFilename) {
            this._args.push("--logger-filename");
            this._args.push(config.logFilename);
        }
        if (config.appendToLog) {
            this._args.push("--append-to-log");
        }
        if (config.verbosity > 0) {
            for (let i=0; i<config.verbosity; i++) {
                this._args.push("-v");
            }
        }
        console.log("config:"+JSON.stringify(config));
        return config;
    }

    debugAdapterExecutable?(folder: WorkspaceFolder | undefined, _token?: CancellationToken): ProviderResult<vscode.DebugAdapterExecutable> {
        console.log("debugAdapterExecutable(folder: "+JSON.stringify(folder)+")");
        console.log("Qore debug adapter: "+this._executable+" args: "+JSON.stringify(this._args));
        return new vscode.DebugAdapterExecutable(this._executable, this._args);
    }
}
