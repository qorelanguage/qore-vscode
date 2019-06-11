'use strict';

import * as child_process from 'child_process';
import * as vscode from 'vscode';
import * as languageclient from 'vscode-languageclient';
import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';

var qoreExecutable: string;
var debugAdapter: string;

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

    qoreExecutable = vscode.workspace.getConfiguration("qore").get("executable") || "qore";
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
    debugAdapter = findQoreScript(context, vscode.workspace.getConfiguration("qore").get("debugAdapter") || "qdbg-vsc-adapter");
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
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('qore', new QoreConfigurationProvider()));

    const factory = new QoreDebugAdapterDescriptorFactory();
    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('qore', factory));

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
    console.log("extension.qore-vscode.deactivate");
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
        console.log("config:"+JSON.stringify(config));
        return config;
    }
}

function getExecutableArguments(configuration: DebugConfiguration): string[] {

    var args: string[] = [debugAdapter];
    if (configuration.request === 'attach') {
        if (!configuration.connection) {
            throw new Error("Connection string not specified");
        }
        args.push("--attach");
        args.push(configuration.connection);
        if (!configuration.program) {
            throw new Error("Program name or id is not specified");
        }
        if (configuration.proxy) {
            args.push("--proxy");
            args.push(configuration.proxy);
        }
        if (typeof configuration.maxRedir !== "undefined") {
            args.push("--max-redir");
            args.push(configuration.maxRedir);
        }
        if (typeof configuration.timeout !== "undefined") {
            args.push("--timeout");
            args.push(configuration.timeout);
        }
        if (typeof configuration.connTimeout !== "undefined") {
            args.push("--conn-timeout");
            args.push(configuration.connTimeout);
        }
        if (typeof configuration.respTimeout !== "undefined") {
            args.push("--resp-timeout");
            args.push(configuration.respTimeout);
        }
        if (typeof configuration.headers !== "undefined") {
            for (var _hdr of configuration.headers) {
                if (typeof _hdr.name !== "string" || typeof _hdr.value !== "string") {
                    throw new Error("Wrong name or value for a header in: "+JSON.stringify(_hdr));
                }
                args.push("--header");
                args.push(_hdr.name + "=" + _hdr.value);
            }
        }
    } else {
        if (!configuration.program) {
            throw new Error("Cannot find a program to debug");
        }
        if (configuration.define) {
            for (let _s in configuration.define) {
                args.push("--define");
                args.push(configuration.define[_s]);
            }
        }
        if (configuration.parseOptions) {
            for (let _s in configuration.parseOptions) {
                args.push("--set-parse-option");
                args.push(configuration.parseOptions[_s]);
            }
        }
        if (configuration.timeZone) {
            args.push("--time-zone");
            args.push(configuration.timeZone);
        }
    }
    if (configuration.fullException) {
        args.push("--full-exception");
    }
    if (configuration.logFilename) {
        args.push("--logger-filename");
        args.push(configuration.logFilename);
    }
    if (configuration.appendToLog) {
        args.push("--append-to-log");
    }
    if (configuration.verbosity > 0) {
        for (let i=0; i<configuration.verbosity; i++) {
            args.push("-v");
        }
    }
    return args;
}

class QoreDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

    createDebugAdapterDescriptor(session: vscode.DebugSession, _executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        console.log("createDebugAdapterDescriptor(session: "+JSON.stringify(session)+")");
        return new vscode.DebugAdapterExecutable(qoreExecutable, getExecutableArguments(session.configuration));
    }
}

/**
 * Execute adapter command and return parsed result. Use "qdbg-vsc-adapter -h" to see list of commands
 */
export function execDebugAdapterCommand(configuration: DebugConfiguration, command: string): any {
    if (!debugAdapter) {
        throw new Error("Debugging support is disabled");
    }
    if (!command) {
        throw new Error("Command is not specified");
    }
    var args: string[] = getExecutableArguments(configuration);
    args.push("-X");
    args.push(command);
    let results = child_process.spawnSync(qoreExecutable, args, {shell: true});
    if (results.status != 0) {
        throw new Error(results.stderr.toString());
    }
    return JSON.parse(results.stdout.toString()).result;

}