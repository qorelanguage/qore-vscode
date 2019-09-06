'use strict';

import * as child_process from 'child_process';
import * as vscode from 'vscode';
import * as languageclient from 'vscode-languageclient';
import * as path from 'path';
import * as fs from 'fs';
import { platform } from 'os';
import * as extract from 'extract-zip';
import * as msg from './qore_message';
import { t, addLocale, useLocale } from 'ttag';
import * as gettext_parser from 'gettext-parser';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';

setLocale();

function setLocale() {
    const default_locale = 'en';
    let use_default_locale: boolean = false;

    let po_file: string | undefined = undefined;
    let locale: string = vscode.workspace.getConfiguration().typescript.locale;

    function setPoFile() {
        if (use_default_locale) {
            locale = default_locale;
        }
        po_file = path.join(__dirname, '..', 'lang', `${locale}.po`);
        if (!fs.existsSync(po_file)) {
            po_file = undefined;
        }
    }

    if (locale) {
        setPoFile();
        if (!po_file && (locale != default_locale)) {
            use_default_locale = true;
            setPoFile();
        }
    }
    else {
        use_default_locale = true;
        setPoFile();
    }

    if (!po_file) {
        msg.error("Language file not found");
        return;
    }

    const translation_object = gettext_parser.po.parse(fs.readFileSync(po_file));
    addLocale(locale, translation_object);
    useLocale(locale);

    if (use_default_locale) {
        msg.log(t`UsingDefaultLocale ${locale}`);
    }
    else {
        msg.log(t`UsingLocaleSettings ${locale}`);
    }
}

let qoreExecutable: string;
let debugAdapter: string;
/*
    We need list of programs in GUI via registerCommand(extension.qore-vscode.getProgram)
    but the connection is also resolvable in registerCommand(extension.qore-vscode.getConnection).
    getConnection is called first but does not update config passed to getProgram. So as
    workaround we pass value via global variable currentConnection which won't work if any
    other resolvable variable appears in connection launch.json.

    Resolving is executed via Debugger::substituesVariables() but I did not find way how to override default
    handling in extension module. Seems we should create new Debuuger class and somehow register for 'qore'
    but it is done in vscode core via contributes.debuggers in package.json.
*/
let currentConnection: string | undefined;

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

//! open an URL in the browser
function openInBrowser(url: string) {
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

function downloadFile(uri: string, dest: string, onSuccess, onError) {
    //console.log("downloading file: " + uri);
    //console.log("destination: " + dest);

    const url = require('url');
    const https = require('https');
    const http = require('http');

    let protocol = url.parse(uri).protocol.slice(0, -1);
    let file = fs.createWriteStream(dest);

    let localOnError = function(error) {
        console.log("error: " + error);
        fs.unlink(dest, err => { onError(err); }); // Delete the file async. (But we don't check the result)
        onError(error);
    };

    let dloadFunc = function(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
            file.on('error', localOnError);
            file.on('finish', function() {
                console.log("download success - finish");
                file.end();  // close() is async, call cb after close completes.
                onSuccess();
            });
            response.pipe(file);
        } else if (response.headers.location) {
            downloadFile(response.headers.location, dest, onSuccess, onError);
        } else {
            localOnError(new Error("server error: " + response));
        }
    };

    if (protocol == "https") {
        https.get(uri, dloadFunc).on('error', localOnError);
    }
    else if (protocol == "http") {
        http.get(uri, dloadFunc).on('error', localOnError);
    }
}

function getQoreVscodePkgVersion(): string {
    return "0.9.0";
}

//! get path to Qore executable from Qore VSCode package
function getQoreVscodePkgQoreExecutable(context: vscode.ExtensionContext): string {
    return context.extensionPath + "\\qore\\bin\\qore.exe";
}

//! get QORE_MODULE_DIR variable for using Qore VSCode package
function getQoreVscodePkgModuleDirVar(context: vscode.ExtensionContext): string {
    let version = getQoreVscodePkgVersion();
    let qoreModuleDir = "";
    qoreModuleDir += context.extensionPath + "\\qore\\lib\\qore-modules;";
    qoreModuleDir += context.extensionPath + "\\qore\\lib\\qore-modules\\" + version + ";";
    qoreModuleDir += context.extensionPath + "\\qore\\share\\qore-modules;";
    qoreModuleDir += context.extensionPath + "\\qore\\share\\qore-modules\\" + version;
    return qoreModuleDir;
}

//! get env var settings for using Qore VSCode package
function getQoreVscodePkgEnv(context: vscode.ExtensionContext): object {
    let env = {
        PATH: process.env.PATH,
        QORE_MODULE_DIR: getQoreVscodePkgModuleDirVar(context)
    };
    return env;
}

//! get arguments for launching QLS
function getServerArgs(context: vscode.ExtensionContext): string[] {
    return [findQoreScript(context, path.join("qls", "qls.q"))];
}

//! options to control the language client
function getClientOptions(): languageclient.LanguageClientOptions {
    let clientOptions: languageclient.LanguageClientOptions = {
        // docs regarding documentSelector:
        // https://code.visualstudio.com/Docs/extensionAPI/vscode-api#DocumentSelector
        // https://code.visualstudio.com/Docs/extensionAPI/vscode-api#DocumentFilter
        documentSelector: [{scheme: 'file', language: 'qore'}],
        synchronize: {
            // synchronize the setting section 'qore' to the server
            configurationSection: 'qore',
            // notify the server about file changes to qore files contained in the workspace
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
    return clientOptions;
}

//! language server options
function getServerOptions(qoreExecutable: string, serverArgs, debugServerArgs, launchOptions?): languageclient.ServerOptions {
    let serverOptions: languageclient.ServerOptions;
    let DEV_MODE = false;
    if (DEV_MODE) {
        serverOptions = () => new Promise<child_process.ChildProcess>((resolve) => {
            function spawnServer(): child_process.ChildProcess {
                if (launchOptions == undefined) {
                    launchOptions = { shell: true };
                }
                else {
                    launchOptions.shell = true;
                }
                let childProcess = child_process.spawn(qoreExecutable, serverArgs, launchOptions);
                childProcess.stderr.on('data', data => { console.log(`stderr: ${data}`); });
                childProcess.stdout.on('data', data => { console.log(`stdout: ${data}`); });
                return childProcess; // uses stdin/stdout for communication
            }

            resolve(spawnServer());
        });
    }
    else {
        serverOptions = {
            run: {command: qoreExecutable, args: serverArgs, options: launchOptions},
            debug: {command: qoreExecutable, args: debugServerArgs, options: launchOptions}
        };
    }
    return serverOptions;
}

//! internal install function for Qore VSCode package
function _installQoreVscodePkg(extensionPath: string, archive: string, extractedName: string, targetDir: string, onSuccess, onError) {
    let archivePath = extensionPath + "/" + archive;

    // unzip archive
    extract(archivePath, {dir: targetDir}, function (err) {
        if (err) {
            console.log("failed extracting qore vscode package: " + err);
            onError(err);
        }
        else {
            console.log("successfully extracted qore vscode package");
            try {
                fs.renameSync(path.join(targetDir, extractedName), path.join(targetDir, "qore"));
            }
            catch (e) {
                onError(e);
                return;
            }
            onSuccess();
        }
    });
}

//! download and install Qore VSCode package
function installQoreVscodePkg(extensionPath: string, onSuccess, onError) {
    let version = getQoreVscodePkgVersion();
    let archive = "qore-" + version + "-git.zip";
    let extractedName = "qore-" + version + "-git";
    let uri = "https://github.com/qorelanguage/qore-vscode/releases/download/v0.3.0/" + archive;
    let filePath = extensionPath + "/" + archive;

    let localOnSuccess = function() {
        console.log("downloaded qore vscode package");
        _installQoreVscodePkg(extensionPath, archive, extractedName, extensionPath, onSuccess, onError);
    };
    let localOnError = function(error) {
        console.log("failed downloading qore vscode package");
        onError(error);
    };

    downloadFile(uri, filePath, localOnSuccess, localOnError);
}

//! check that Qore is working
function checkQoreOk(qoreExecutable: string, launchOptions?): boolean {
    if (launchOptions == undefined) {
        launchOptions = { shell: true };
    } else {
        launchOptions.shell = true;
    }

    let results = child_process.spawnSync(qoreExecutable, ["-l astparser -l json -ne \"int x = 1; x++;\""], launchOptions);
    if (results.status == 0) {
        return true;
    }
    return false;
}

//! check that Qore from VSCode package is working
function checkQoreVscodePkgOk(context: vscode.ExtensionContext) {
    let qoreExecutable = getQoreVscodePkgQoreExecutable(context);
    let env = getQoreVscodePkgEnv(context);
    return checkQoreOk(qoreExecutable, { env: env });
}

//! check that Qore debugger is working
function checkDebuggerOk(qoreExecutable: string, dbg: string): boolean {
    let results = child_process.spawnSync(qoreExecutable, [dbg, "-h"], {shell: true});
    if (results.status != 1) {
        return false;
    }
    return true;
}

function launchLanguageClient(context: vscode.ExtensionContext, serverOptions, clientOptions) {
    let lc = new languageclient.LanguageClient('qls', 'Qore Language Server', serverOptions, clientOptions);
    let disposable;

    disposable = lc.start();
    console.log(t`StartedQLS`);

    // Push the disposable to the context's subscriptions so that the
    // client can be deactivated on extension deactivation
    context.subscriptions.push(disposable);
}

function launchQLS(context: vscode.ExtensionContext, qoreExecutable: string, serverOptions?: languageclient.ServerOptions) {
    if (serverOptions == undefined) {
        // language server command-line arguments
        let serverArgs = getServerArgs(context);
        let debugServerArgs = serverArgs;

        // language server options
        serverOptions = getServerOptions(qoreExecutable, serverArgs, debugServerArgs);
    }

    // options to control the language client
    let clientOptions = getClientOptions();

    // create the language client and start it
    launchLanguageClient(context, serverOptions, clientOptions);
}

function launchQLSWithQoreVscodePkg(context: vscode.ExtensionContext) {
    let qoreExecutable = getQoreVscodePkgQoreExecutable(context);
    let env = getQoreVscodePkgEnv(context);
    let serverArgs = getServerArgs(context);
    let serverOptions = getServerOptions("qore", serverArgs, serverArgs, { env: env });
    launchQLS(context, qoreExecutable, serverOptions);
}

function pushDebugSubscriptions(context: vscode.ExtensionContext) {
    // debug commands
    context.subscriptions.push(vscode.commands.registerCommand('extension.qore-vscode.getFilename', _config => {
        // show input box is invoded async in executeCommandVariables so result of command is a Thenable object
        return vscode.window.showInputBox({
            //prompt: "",
            placeHolder: t`FilenamePlaceHolder`,
            value: "script.q"
        });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('extension.qore-vscode.getConnection', _config => {
        return vscode.window.showInputBox({
            placeHolder: t`ConnectionPlaceHolder`,
            value: "ws://localhost:8001/debug"
        }).then(conn => {
            // save value for getProgramFromList
            currentConnection = conn;
            return conn;
        });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('extension.qore-vscode.getProgram', config => {
        config.connection = currentConnection;  // resolve potential variable
        let pgms = execDebugAdapterCommand(config, 'pgmlist');
        let items: string[] = [];
        for (let key in pgms) {
            if (pgms[key].debugging) {
                items.push(pgms[key].scriptName);
            }
        }
        return vscode.window.showQuickPick(items, {
            canPickMany: false,
            placeHolder: t`ProgramPlaceHolder`,
        });
    }));

    // debug configuration classes
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('qore', new QoreConfigurationProvider()));
    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('qore', new QoreDebugAdapterDescriptorFactory()));

    // debug events
    context.subscriptions.push(vscode.debug.onDidStartDebugSession(session => {
        if (session.type == "qore") {
            msg.info(t`SessionStarted ${session.configuration.program}`);
        }
    }));
    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(session => {
        if (session.type == "qore") {
            msg.info(t`SessionTerminated ${session.configuration.program}`);
        }
    }));
    context.subscriptions.push(vscode.debug.onDidChangeActiveDebugSession(session => {
        if (session !== undefined && session.type == "qore") {
            // msg.info(t`SessionChanged ${session.configuration.program}`);
        }
    }));
    context.subscriptions.push(vscode.debug.onDidReceiveDebugSessionCustomEvent(_event => {
    }));
}

function getNoDebugExportApi() {
    let api = {
        getQoreExecutable(): string {
            return qoreExecutable;
        }
    };
    return api;
}

function getExportApi() {
    let api = {
        execDebugAdapterCommand(configuration: DebugConfiguration, command: string): any {
            return execDebugAdapterCommand(configuration, command);
        },
        getQoreExecutable(): string {
            return qoreExecutable;
        },
        getExecutableArguments(configuration: DebugConfiguration): string[] {
            return getExecutableArguments(configuration);
        }
    };
    return api;
}

export async function activate(context: vscode.ExtensionContext) {
    // "Converting circular structure to JSON" when using JSON.stringify()
    // util.inspect() is proposed fix but it has another issue so limit depth
    //let util = require('util');
    //console.log("QoreConfigurationProvider(context: "+ util.inspect(context, {depth: 1}));

    qoreExecutable = vscode.workspace.getConfiguration("qore").get("executable") || "qore";
    console.log(t`QoreExecutable ${qoreExecutable}`);

    // find out if QLS should run
    let useQLS = vscode.workspace.getConfiguration("qore").get("useQLS");
    if (useQLS) {
        // find out if Qore and necessary modules are present and working
        let qoreOk = checkQoreOk(qoreExecutable);
        let qoreVscodePkgOk = checkQoreVscodePkgOk(context);

        if (qoreOk) {
            launchQLS(context, qoreExecutable);
        }
        else if (qoreVscodePkgOk) {
            launchQLSWithQoreVscodePkg(context);
        }
        else {
            msg.warning(t`QoreAndModulesNotFound`);

            if (platform() == "win32") {
                let install = function(msg: string, isErr: boolean, ok, err) {
                    let installThen = selection => {
                        if (selection != "Yes") {
                            return;
                        }
                        installQoreVscodePkg(context.extensionPath, ok, err);
                    };
                    if (isErr) {
                        vscode.window.showErrorMessage(msg, "Yes", "No").then(installThen);
                    }
                    else {
                        vscode.window.showWarningMessage(msg, "Yes", "No").then(installThen);
                    }
                };
                let installOk = () => {
                    launchQLSWithQoreVscodePkg(context);
                };
                let installErr = err => {
                    console.log("download of qore vscode package failed: " + err);
                    install(t`QoreVscodePkgInstallFailed`, true, installOk, installErr);
                };

                install(t`QoreNotOkInstallVscodePkg`, false, installOk, installErr);
            }
            else {
                openInBrowser("https://github.com/qorelanguage/qore-vscode/wiki/Visual-Code-for-Qore-Language-Setup");
            }
        }
    }

    // modify debugAdapter to "/qvscdbg-test" and executable to "bash" just in case the adapter silently won't start and check command it log
    debugAdapter = findQoreScript(context, vscode.workspace.getConfiguration("qore").get("debugAdapter") || "qdbg-vsc-adapter");
    let debuggerOk = checkDebuggerOk(qoreExecutable, debugAdapter);
    if (!debuggerOk) {
        msg.error(t`DebugAdapterNotFound '${debugAdapter}'`);
        return getNoDebugExportApi();
    }

    pushDebugSubscriptions(context);

    // export public API-interface
    return getExportApi();
}

// this method is called when your extension is deactivated
export function deactivate() {
}

// debugger stuff
class QoreConfigurationProvider implements vscode.DebugConfigurationProvider {
    /**
        Massage a debug configuration just before a debug session is being launched,
        e.g. add all missing attributes to the debug configuration.
        Commands ${command:xxx} are invoked by vscode substituteVariables() and value is substituted
     */
    resolveDebugConfiguration(_folder: WorkspaceFolder | undefined, config: DebugConfiguration, _token?: CancellationToken): ProviderResult<DebugConfiguration> {
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
        currentConnection = config.connection;
        return config;
    }
}

function getExecutableArguments(configuration: DebugConfiguration): string[] {
    let args: string[] = [debugAdapter];
    if (configuration.request === 'attach') {
        if (!configuration.connection) {
            throw new Error(t`ConnectionNotSpecified`);
        }
        args.push("--attach");
        args.push(configuration.connection);
        if (!configuration.program) {
            throw new Error(t`ProgramNotSpecified`);
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
            for (let _hdr of configuration.headers) {
                if (typeof _hdr.name !== "string" || typeof _hdr.value !== "string") {
                    let hdrs: string = JSON.stringify(_hdr);
                    throw new Error(t`WrongHeader ${hdrs}`);
                }
                args.push("--header");
                args.push(_hdr.name + "=" + _hdr.value);
            }
        }
    } else {
        if (!configuration.program) {
            throw new Error(t`ProgramFileNotSpecified`);
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
        let s: string;
        if (session.configuration.request == "attach") {
            s = t`Connecting ${session.configuration.connection} ${session.configuration.program}`;
        } else {
            s = t`Launching ${session.configuration.program}`;
        }
        msg.info(s);
        let args: string[] = getExecutableArguments(session.configuration);
        console.log(qoreExecutable + " " + args.join(" "));
        return new vscode.DebugAdapterExecutable(qoreExecutable, args);
    }
}

/**
 * Execute adapter command and return parsed result. Use "qdbg-vsc-adapter -h" to see list of commands
 */
export function execDebugAdapterCommand(configuration: DebugConfiguration, command: string): any {
    if (!debugAdapter) {
        throw new Error(t`DebuggingIsDisabled`);
    }
    if (!command) {
        throw new Error(t`CommandNotSpecified`);
    }
    let args: string[] = getExecutableArguments(configuration);
    args.push("-X");
    args.push(command);
    let results = child_process.spawnSync(qoreExecutable, args, {shell: true});
    if (results.status != 0) {
        throw new Error(results.stderr.toString());
    }
    return JSON.parse(results.stdout.toString()).result;
}