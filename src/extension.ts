import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs-extra';
import * as gettext_parser from 'gettext-parser';
import { platform } from 'os';
import { join } from 'path';
import { t, addLocale, useLocale } from 'ttag';
import * as vscode from 'vscode';
import {
    CancellationToken,
    DebugConfiguration,
    ProviderResult,
    WorkspaceFolder
} from 'vscode';

import { getDocumentSymbolsImpl, QoreTextDocument } from './documentSymbols';
import { QLSManager } from './QLSManager';
import {
    checkDebuggerOk,
    checkQoreOk,
    checkQoreVscPkgOk
} from './qoreChecks';
import {
    getInstalledQoreVscPkgVersion,
    getLatestQoreVscPkgVersion,
    installQoreVscPkg,
    isQoreVscPkgInstalled
} from './qoreVscPkg';
import * as msg from './qore_message';
import { compareVersion, findScript, openInBrowser } from './utils';

let qlsManager: QLSManager = new QLSManager();

let qoreExecutable: string = "";
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
        po_file = join(__dirname, '..', 'lang', `${locale}.po`);
        if (!existsSync(po_file)) {
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

    const translation_object = gettext_parser.po.parse(readFileSync(po_file));
    addLocale(locale, translation_object);
    useLocale(locale);

    if (use_default_locale) {
        msg.log(t`UsingDefaultLocale ${locale}`);
    }
    else {
        msg.log(t`UsingLocaleSettings ${locale}`);
    }
}

function qoreVscPkgInstallation(extensionPath: string) {
    const install = function(messageToShow: string, showError: boolean, onSuccess, onError) {
        const installThen = async selection => {
            if (selection != "Yes") {
                return;
            }

            // stop QLS if it's running
            await qlsManager.stop();

            installQoreVscPkg(extensionPath, onSuccess, onError);
        };
        if (showError) {
            vscode.window.showErrorMessage(messageToShow, "Yes", "No").then(
                installThen,
                err => { msg.logPlusConsole(String(err)); }
            );
        }
        else {
            vscode.window.showWarningMessage(messageToShow, "Yes", "No").then(
                installThen,
                err => { msg.logPlusConsole(String(err)); }
            );
        }
    };
    const installOk = () => {
        qlsManager.startWithQoreVscPkg(extensionPath);
    };
    let installErr = () => {
        install(t`TryAgainQoreVscPkgInstall`, true, installOk, installErr);
    };

    install(t`QoreNotOkInstallQoreVscPkg`, false, installOk, installErr);
}

function doQLSLaunch(context: vscode.ExtensionContext, useQLS, launchOnly: boolean) {
    if (qoreExecutable == "") {
        qoreExecutable = vscode.workspace.getConfiguration("qore").get("executable") || "qore";
        console.log(t`QoreExecutable ${qoreExecutable}`);
    }

    if (!useQLS) {
        return;
    }

    // find out if Qore and necessary modules are present and working
    const qoreOk = checkQoreOk(qoreExecutable);
    const qoreVscPkgOk = checkQoreVscPkgOk(context.extensionPath);

    // start QLS
    if (qoreOk) {
        qlsManager.start(context.extensionPath, qoreExecutable);
    }
    else if (qoreVscPkgOk) {
        qlsManager.startWithQoreVscPkg(context.extensionPath);
    }
    else if (!launchOnly) {
        if (platform() == "win32") { // offer installing Qore VSCode package
            qoreVscPkgInstallation(context.extensionPath);
        }
        else {
            msg.warning(t`QoreAndModulesNotFound`);
            openInBrowser("https://github.com/qorelanguage/qore-vscode/wiki/Visual-Code-for-Qore-Language-Setup");
        }
    }
}

function registerCommands(context: vscode.ExtensionContext) {
    if (platform() == "win32") {
        // install Qore VSCode package command
        // only installs if it is not installed yet, otherwise shows a warning
        context.subscriptions.push(vscode.commands.registerCommand('qore-vscode.installQoreVscPkg', async _config => {
            if (isQoreVscPkgInstalled(context.extensionPath)) {
                msg.warning(t`QoreVscPkgAlreadyInstalled`);
                return;
            }

            // stop QLS if it's running
            await qlsManager.stop();

            installQoreVscPkg(context.extensionPath, () => {}, () => {});
        }));

        // reinstall Qore VSCode package command
        context.subscriptions.push(vscode.commands.registerCommand('qore-vscode.reinstallQoreVscPkg', async _config => {
            // stop QLS if it's running
            await qlsManager.stop();

            installQoreVscPkg(context.extensionPath, () => {}, () => {});
        }));

        // update Qore VSCode package command
        // updates if installed version is lower than latest
        context.subscriptions.push(vscode.commands.registerCommand('qore-vscode.updateQoreVscPkg', async _config => {
            const latestVer = getLatestQoreVscPkgVersion();
            const currentVer = getInstalledQoreVscPkgVersion(context.extensionPath);
            const result = compareVersion(latestVer, currentVer);
            if (result == undefined || result == 1) {
                // stop QLS if it's running
                await qlsManager.stop();

                installQoreVscPkg(context.extensionPath, () => {}, () => {});
            }
            else {
                msg.info(t`LatestQoreVscPkgInstalled`);
            }
        }));
    }

    // stop QLS command
    context.subscriptions.push(vscode.commands.registerCommand('qore-vscode.stopQLS', _config => {
        qlsManager.stop();
    }));

    // start QLS command
    context.subscriptions.push(vscode.commands.registerCommand('qore-vscode.startQLS', _config => {
        if (qlsManager.started()) {
            msg.info(t`QLSAlreadyStarted`);
            return;
        }

        doQLSLaunch(context, true, true);
    }));
}

function pushDebugSubscriptions(context: vscode.ExtensionContext) {
    // debug commands
    context.subscriptions.push(vscode.commands.registerCommand('extension.qore-vscode.getFilename', _config => {
        // show input box is invoked async in executeCommandVariables so result of command is a Thenable object
        return vscode.window.showInputBox({
            //prompt: "",
            placeHolder: t`FilenamePlaceHolder`,
            value: "script.q"
        }).then(
            input => {
                if (!input) {
                    return;
                }
                console.log("Got input in qore-vscode.getFilename command: " + input);
                // ignored for now
                // TODO tmandys has to explain why the input is ignored here
            },
            err => {
                console.log(err);
            }
        );
    }));
    context.subscriptions.push(vscode.commands.registerCommand('extension.qore-vscode.getConnection', _config => {
        return vscode.window.showInputBox({
            placeHolder: t`ConnectionPlaceHolder`,
            value: "ws://localhost:8001/debug"
        }).then(
            conn => {
                if (!conn) {
                    throw Error();
                }
                // save value for getProgramFromList
                currentConnection = conn;
                return conn;
            },
            err => {
                console.log(err);
            }
        );
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
        }).then(
            input => {
                if (!input) {
                    return;
                }
                console.log("Got input in qore-vscode.getProgram command: " + input);
                // ignored for now
                // TODO tmandys has to explain why the input is ignored here
            },
            err => {
                console.log(err);
            }
        );
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
        // ignored
    }));
}

function getNoDebugExportApi() {
    const api = {
        getQoreExecutable(): string {
            return qoreExecutable;
        }
    };
    return api;
}

function getExportApi() {
    const api = {
        execDebugAdapterCommand(configuration: DebugConfiguration, command: string): any {
            return execDebugAdapterCommand(configuration, command);
        },
        getQoreExecutable(): string {
            return qoreExecutable;
        },
        getExecutableArguments(configuration: DebugConfiguration): string[] {
            return getExecutableArguments(configuration);
        },
        async getDocumentSymbols(doc: QoreTextDocument, retType?: string): Promise<any> {
            let n = 100;
            while (!qlsManager.languageClientReady() && --n) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            return getDocumentSymbolsImpl(qlsManager, doc, retType);
        }
    };
    return api;
}

export async function activate(context: vscode.ExtensionContext) {
    // "Converting circular structure to JSON" when using JSON.stringify()
    // util.inspect() is proposed fix but it has another issue so limit depth
    //let util = require('util');
    //console.log("QoreConfigurationProvider(context: "+ util.inspect(context, {depth: 1}));

    // register user commands for Qore and QLS
    registerCommands(context);

    // find out if QLS should run
    let useQLS = vscode.workspace.getConfiguration("qore").get("useQLS");

    // launch QLS
    doQLSLaunch(context, useQLS, false);

    // modify debugAdapter to "/qvscdbg-test" and executable to "bash" just in case the adapter silently won't start and check command it log
    debugAdapter = findScript(context.extensionPath, vscode.workspace.getConfiguration("qore").get("debugAdapter") || "qdbg-vsc-adapter");
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
    return qlsManager.stop();
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
    let results = spawnSync(qoreExecutable, args, {shell: true});
    if (results.status != 0) {
        throw new Error(results.stderr.toString());
    }
    return JSON.parse(results.stdout.toString()).result;
}
