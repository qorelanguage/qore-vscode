import * as child_process from 'child_process';
import * as vscode from 'vscode';
import * as languageclient from 'vscode-languageclient';
import * as path from 'path';
import * as fs from 'fs-extra';
import { platform } from 'os';
import * as extract from 'extract-zip';
import * as msg from './qore_message';
import { t, addLocale, useLocale } from 'ttag';
import * as gettext_parser from 'gettext-parser';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';

export interface QoreTextDocument {
    uri: string;
    text: string;
    languageId: string;
    version: number;
}

let languageClient: languageclient.LanguageClient | undefined = undefined;
let languageClientReady: boolean = false;
let startedQLS: boolean = false;
let stoppingQLS: boolean = false;
let installInProgress: boolean = false;
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

function compareVersion(v1, v2) {
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
    const command: string = executable + ' ' + url;
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
                //console.log("Download success");
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

//! get path to Qore VSCode package dir
function getQoreVscPkgPath(extensionPath: string): string {
    return path.join(extensionPath, "qore");
}

//! get path to Qore VSCode package version file
function getQoreVscPkgVersionPath(extensionPath: string): string {
    return path.join(getQoreVscPkgPath(extensionPath), "pkg-ver.txt");
}

//! get path to Qore executable in Qore VSCode package
function getQoreVscPkgQoreExecutable(extensionPath: string): string {
    if (platform() == "win32") {
        return path.join(getQoreVscPkgPath(extensionPath), "bin", "qore.exe");
    }
    return path.join(getQoreVscPkgPath(extensionPath), "bin", "qore");
}

//! get QORE_MODULE_DIR variable for using Qore VSCode package
function getQoreVscPkgModuleDirVar(extensionPath: string): string {
    const version = getLatestQoreVscPkgVersion();
    const pkgPath = getQoreVscPkgPath(extensionPath);
    const sep = (platform() == "win32") ? ";" : ":";
    let qoreModuleDir = "";
    qoreModuleDir += path.join(pkgPath, "lib", "qore-modules") + sep;
    qoreModuleDir += path.join(pkgPath, "lib", "qore-modules", version) + sep;
    qoreModuleDir += path.join(pkgPath, "share", "qore-modules") + sep;
    qoreModuleDir += path.join(pkgPath, "share", "qore-modules", version);
    return qoreModuleDir;
}

//! get env var settings for using Qore VSCode package
function getQoreVscPkgEnv(extensionPath: string): object {
    const env = {
        PATH: process.env.PATH,
        QORE_MODULE_DIR: getQoreVscPkgModuleDirVar(extensionPath)
    };
    return env;
}

function getLatestQoreVscPkgVersion(): string {
    return "0.9.0";
}

function getInstalledQoreVscPkgVersion(extensionPath: string): string | undefined {
    if (!isQoreVscodePkgInstalled(extensionPath)) {
        return undefined;
    }
    let verString: any = undefined;
    try {
        verString = fs.readFileSync(
            getQoreVscPkgVersionPath(extensionPath),
            { encoding: 'utf8' }
        );
    }
    catch (err) {
        return undefined;
    }
    return verString;
}

//! Is Qore VSCode package installed?
function isQoreVscodePkgInstalled(extensionPath: string): boolean {
    if (!fs.existsSync(getQoreVscPkgPath(extensionPath))) {
        return false;
    }
    if (!fs.existsSync(getQoreVscPkgQoreExecutable(extensionPath))) {
        return false;
    }
    return true;
}

//! get arguments for starting QLS
function getServerArgs(context: vscode.ExtensionContext): string[] {
    return [findQoreScript(context, path.join("qls", "qls.q"))];
}

//! options to control the language client
function getClientOptions(): languageclient.LanguageClientOptions {
    const clientOptions: languageclient.LanguageClientOptions = {
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
                vscode.workspace.createFileSystemWatcher('**/*.qstep'),
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
    const DEV_MODE = false;
    if (DEV_MODE) {
        serverOptions = () => new Promise<child_process.ChildProcess>((resolve) => {
            function spawnServer(): child_process.ChildProcess {
                if (launchOptions == undefined) {
                    launchOptions = { shell: true };
                }
                else {
                    launchOptions.shell = true;
                }
                let childProcess = child_process.spawn(
                    qoreExecutable,
                    serverArgs,
                    launchOptions
                );
                childProcess.stderr.on('data', data => {
                    console.log(`stderr: ${data}`);
                });
                childProcess.stdout.on('data', data => {
                    console.log(`stdout: ${data}`);
                });
                return childProcess; // uses stdin/stdout for communication
            }

            resolve(spawnServer());
        });
    }
    else {
        serverOptions = {
            run: {
                command: qoreExecutable,
                args: serverArgs,
                options: launchOptions
            },
            debug: {
                command: qoreExecutable,
                args: debugServerArgs,
                options: launchOptions
            }
        };
    }
    return serverOptions;
}

//! check that Qore is working
function checkQoreOk(qoreExecutable: string, launchOptions?): boolean {
    if (launchOptions == undefined) {
        launchOptions = { shell: true };
    } else {
        launchOptions.shell = true;
    }

    console.log("Checking Qore executable: " + qoreExecutable);
    const results = child_process.spawnSync(
        qoreExecutable,
        ["-l astparser -l json -ne \"int x = 1; x++;\""],
        launchOptions
    );
    if (results.status == 0) {
        console.log("Qore executable ok");
        return true;
    }
    console.log("Qore executable check failed");
    return false;
}

//! check that Qore from VSCode package is working
function checkQoreVscodePkgOk(context: vscode.ExtensionContext) {
    const qoreExecutable = getQoreVscPkgQoreExecutable(context.extensionPath);
    const env = getQoreVscPkgEnv(context.extensionPath);
    return checkQoreOk(qoreExecutable, { env: env });
}

//! check that Qore debugger is working
function checkDebuggerOk(qoreExecutable: string, dbg: string): boolean {
    console.log("Checking Qore debugger with Qore executable: " + qoreExecutable);
    let results = child_process.spawnSync(
        qoreExecutable,
        [dbg, "-h"],
        {shell: true}
    );
    if (results.status != 1) {
        console.log("Qore debugger check failed");
        return false;
    }
    console.log("Qore debugger ok");
    return true;
}

//! internal install function for Qore VSCode package
function _installQoreVscPkg(extensionPath: string, version: string, archive: string, extractedName: string, targetDir: string, onSuccess, onError) {
    const archivePath = extensionPath + "/" + archive;

    // unzip archive
    extract(archivePath, {dir: targetDir}, err => {
        if (err) {
            const message = t`FailedExtractionQoreVscPkg`;
            msg.logPlusConsole(message + ': ' + err);
            onError(message);
            return;
        }

        msg.logPlusConsole(t`ExtractedQoreVscPkg`);
        // now rename the extracted dir
        try {
            fs.renameSync(
                path.join(targetDir, extractedName),
                path.join(targetDir, "qore")
            );
        }
        catch (e) {
            const message = t`FailedRenameQoreVscPkg`;
            msg.logPlusConsole(message + ': ' + e);
            onError(message);
            return;
        }
        fs.writeFileSync(
            path.join(getQoreVscPkgVersionPath(extensionPath)),
            version
        );
        msg.logPlusConsole(t`QoreVscPkgInstallOk`);
        onSuccess();
    });
}

//! download and install Qore VSCode package
async function installQoreVscPkg(extensionPath: string, onSuccess, onError) {
    if (installInProgress) {
        msg.warning(t`InstallAlreadyInProgress`);
        return;
    }
    installInProgress = true;

    const version = getLatestQoreVscPkgVersion();
    const archive = "qore-" + version + "-git.zip";
    const extractedName = "qore-" + version + "-git";
    const uri = "https://github.com/qorelanguage/qore-vscode/releases/download/v0.3.0/" + archive;
    const filePath = extensionPath + "/" + archive;

    const onInstallSuccess = function() {
        installInProgress = false;
        msg.info(t`InstalledQoreVscPkg`);
        onSuccess();
    };
    const onInstallError = function(err) {
        installInProgress = false;
        msg.error(t`QoreVscPkgInstallFailed` + ": " + err);
        onError(err);
    };

    const onDownloadSuccess = function() {
        msg.info(t`DloadedQoreVscPkg`);
        msg.info(t`InstallingQoreVscPkg`);
        _installQoreVscPkg(
            extensionPath,
            version,
            archive,
            extractedName,
            extensionPath,
            onInstallSuccess,
            onInstallError
        );
    };
    const onDownloadError = function(err) {
        installInProgress = false;
        msg.error(t`FailedDownloadQoreVscPkg` + ": " + err);
        onError(err);
    };

    // stop QLS if it's running
    await stopQLS();

    // remove old package if it is present
    const pkgPath = getQoreVscPkgPath(extensionPath);
    if (fs.existsSync(pkgPath)) {
        try {
            fs.removeSync(pkgPath);
        }
        catch (err) {
            msg.logPlusConsole("Failed removing previously installed package" + String(err));
        }
    }

    msg.info(t`DloadingQoreVscPkg`);
    downloadFile(uri, filePath, onDownloadSuccess, onDownloadError);
}

function qoreVscodePkgInstallation(context: vscode.ExtensionContext) {
    const install = function(messageToShow: string, showError: boolean, onSuccess, onError) {
        const installThen = selection => {
            if (selection != "Yes") {
                return;
            }
            installQoreVscPkg(context.extensionPath, onSuccess, onError);
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
        startQLSWithQoreVscodePkg(context);
    };
    let installErr = () => {
        install(t`TryAgainQoreVscPkgInstall`, true, installOk, installErr);
    };

    install(t`QoreNotOkInstallQoreVscPkg`, false, installOk, installErr);
}

async function stopQLS() {
    if (stoppingQLS) {
        return;
    }
    stoppingQLS = true;

    if (!startedQLS || languageClient == undefined) {
        msg.logPlusConsole(t`QLSAlreadyStopped`);
        stoppingQLS = false;
        return;
    }

    msg.logPlusConsole(t`StoppingQLS`);
    try {
        await languageClient.stop();
    }
    catch (err) {
        msg.logPlusConsole("Failed stopping QLS: " + err);
        stoppingQLS = false;
        return;
    }
    languageClient = undefined;
    startedQLS = false;
    await new Promise(done => setTimeout(done, 500));
    msg.info(t`StoppedQLS`);
    stoppingQLS = false;
    return;
}

function launchLanguageClient(serverOptions, clientOptions) {
    languageClient = new languageclient.LanguageClient(
        'qls',
        'Qore Language Server',
        serverOptions,
        clientOptions
    );
    languageClient.onReady().then(
        () => { languageClientReady = true; }
    );
    languageClient.start();
    startedQLS = true;
    msg.log(t`StartedLanguageClient`);
}

function startQLS(context: vscode.ExtensionContext, qoreExecutable: string, serverOptions?: languageclient.ServerOptions) {
    if (serverOptions == undefined) {
        msg.logPlusConsole(t`StartingQLSWithExe ${qoreExecutable}`);
        // language server command-line arguments
        const serverArgs = getServerArgs(context);
        const debugServerArgs = serverArgs;

        // language server options
        serverOptions = getServerOptions(
            qoreExecutable,
            serverArgs,
            debugServerArgs
        );
    }

    // options to control the language client
    const clientOptions = getClientOptions();

    // create the language client and start it
    launchLanguageClient(serverOptions, clientOptions);
    msg.logPlusConsole(t`StartedQLS`);
}

function startQLSWithQoreVscodePkg(context: vscode.ExtensionContext) {
    msg.logPlusConsole(t`StartingQLSVscPkg`);
    const qoreExecutable = getQoreVscPkgQoreExecutable(context.extensionPath);
    const env = getQoreVscPkgEnv(context.extensionPath);
    const serverArgs = getServerArgs(context);
    const serverOptions = getServerOptions(
        qoreExecutable,
        serverArgs,
        serverArgs,
        { env: env }
    );
    msg.logPlusConsole(t`StartingQLSWithExe ${qoreExecutable}`);
    startQLS(context, qoreExecutable, serverOptions);
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
    const qoreVscPkgOk = checkQoreVscodePkgOk(context);

    // start QLS
    if (qoreOk) {
        startQLS(context, qoreExecutable);
    }
    else if (qoreVscPkgOk) {
        startQLSWithQoreVscodePkg(context);
    }
    else if (!launchOnly) {
        if (platform() == "win32") { // offer installing Qore VSCode package
            qoreVscodePkgInstallation(context);
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
        context.subscriptions.push(vscode.commands.registerCommand('qore-vscode.installQoreVscPkg', _config => {
            if (isQoreVscodePkgInstalled(context.extensionPath)) {
                msg.warning(t`QoreVscPkgAlreadyInstalled`);
                return;
            }
            installQoreVscPkg(context.extensionPath, () => {}, () => {});
        }));

        // reinstall Qore VSCode package command
        context.subscriptions.push(vscode.commands.registerCommand('qore-vscode.reinstallQoreVscPkg', _config => {
            installQoreVscPkg(context.extensionPath, () => {}, () => {});
        }));

        // update Qore VSCode package command
        // updates if installed version is lower than latest
        context.subscriptions.push(vscode.commands.registerCommand('qore-vscode.updateQoreVscPkg', _config => {
            const latestVer = getLatestQoreVscPkgVersion();
            const currentVer = getInstalledQoreVscPkgVersion(context.extensionPath);
            const result = compareVersion(latestVer, currentVer);
            if (result == undefined) {
                installQoreVscPkg(context.extensionPath, () => {}, () => {});
            }
            else if (result == 1) {
                installQoreVscPkg(context.extensionPath, () => {}, () => {});
            }
            else {
                msg.info(t`LatestQoreVscPkgInstalled`);
            }
        }));
    }

    // stop QLS command
    context.subscriptions.push(vscode.commands.registerCommand('qore-vscode.stopQLS', _config => {
        stopQLS();
    }));

    // start QLS command
    context.subscriptions.push(vscode.commands.registerCommand('qore-vscode.startQLS', _config => {
        if (startedQLS || languageClient != undefined) {
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
            while (!languageClientReady && --n) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            return getDocumentSymbolsIntern(doc, retType);
        }
    };
    return api;
}

function getDocumentSymbolsIntern(doc: QoreTextDocument, retType?: string): any {
    const params = {
        textDocument: doc,
        ... retType ? { retType } : {}
    };
    if (languageClient == undefined) {
        return Promise.resolve(null);
    }

    try {
        languageClient.sendRequest('textDocument/didOpen', params);
        return languageClient.sendRequest('textDocument/documentSymbol', params);
    }
    catch (e){
        return Promise.resolve(null);
    }
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
    if (!languageClient) {
        return undefined;
    }
    return languageClient.stop();
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
