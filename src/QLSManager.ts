import { t } from 'ttag';
import { CancellationToken } from 'vscode';
import { LanguageClient, ServerOptions } from 'vscode-languageclient';

import { getClientOptions } from './clientOptions';
import * as msg from './qore_message';
import { QoreLaunchConfig } from './QoreLaunchConfig';
import { getQoreVscPkgEnv, getQoreVscPkgQoreExecutable } from './qoreVscPkg';
import { getServerArgs } from './serverArgs';
import { getServerOptions } from './serverOptions';

export class QLSManager {
    private _languageClient: LanguageClient | undefined = undefined;
    private _languageClientReady: boolean = false;
    private _startedQLS: boolean = false;
    private _stoppingQLS: boolean = false;

    constructor() {}

    started() {
        return this._startedQLS;
    }

    stopped() {
        return !this._startedQLS;
    }

    languageClientReady() {
        return this._languageClientReady;
    }

    private launchLanguageClient(serverOptions: ServerOptions, clientOptions) {
        this._languageClient = new LanguageClient(
            'qls',
            'Qore Language Server',
            serverOptions,
            clientOptions
        );
        this._languageClient.onReady().then(
            () => { this._languageClientReady = true; }
        );
        this._languageClient.start();
        this._startedQLS = true;
        msg.log(t`StartedLanguageClient`);
    }

    start(extensionPath: string, qoreExec: string, serverOptions?: ServerOptions) {
        if (serverOptions === undefined) {
            // language server command-line arguments
            const serverArgs = getServerArgs(extensionPath);
            const debugServerArgs = serverArgs;
            console.log(t`serverArgs: ${JSON.stringify(serverArgs)}`);

            // language server options
            serverOptions = getServerOptions(
                qoreExec,
                serverArgs,
                debugServerArgs
            );
        } else {
            console.log(t`serverOptions: ${JSON.stringify(serverOptions)}`);
        }

        msg.logPlusConsole(t`StartingQLSWithExe ${qoreExec}`);

        // options to control the language client
        const clientOptions = getClientOptions();

        // create the language client and start it
        this.launchLanguageClient(serverOptions, clientOptions);
        msg.logPlusConsole(t`StartedQLS`);
    }

    startWithQoreVscPkg(extensionPath: string) {
        msg.logPlusConsole(t`StartingQLSVscPkg`);
        const qoreExec = getQoreVscPkgQoreExecutable(extensionPath);
        const env = getQoreVscPkgEnv(extensionPath);
        const serverArgs = getServerArgs(extensionPath);
        const serverOptions = getServerOptions(
            qoreExec,
            serverArgs,
            serverArgs,
            { env: env }
        );
        this.start(extensionPath, qoreExec, serverOptions);
    }

    startWithLaunchConfig(extensionPath: string, config: QoreLaunchConfig) {
        const qoreExec = config.getQoreExec();
        const env = config.getLaunchEnv();
        const serverArgs = getServerArgs(extensionPath);
        let serverOptions;
        if (env !== undefined) {
            serverOptions = getServerOptions(
                qoreExec,
                serverArgs,
                serverArgs,
                { env: env }
            );
        } else {
            serverOptions = getServerOptions(
                qoreExec,
                serverArgs,
                serverArgs,
            );
        }
        this.start(extensionPath, qoreExec, serverOptions);
    }

    async stop() {
        // return if already being stopped
        if (this._stoppingQLS) {
            return;
        }
        this._stoppingQLS = true;

        // return if not running
        if (!this._startedQLS || this._languageClient === undefined) {
            msg.logPlusConsole(t`QLSAlreadyStopped`);
            this._stoppingQLS = false;
            return;
        }

        // stop the language client
        msg.logPlusConsole(t`StoppingQLS`);
        try {
            await this._languageClient.stop();
        }
        catch (err) {
            msg.logPlusConsole("Failed stopping QLS: " + err);
            this._stoppingQLS = false;
            return;
        }
        this._languageClientReady = false;
        this._startedQLS = false;
        this._languageClient = undefined;

        // wait for halfsecond until showing message and returning
        await new Promise(done => setTimeout(done, 500));
        msg.info(t`StoppedQLS`);
        this._stoppingQLS = false;
        return;
    }

    sendRequest(method: string, params: any, token?: CancellationToken | undefined) {
        if (this._languageClient === undefined) {
            return Promise.resolve(null);
        }
        if (token !== undefined) {
            return this._languageClient.sendRequest(method, params, token);
        } else {
            return this._languageClient.sendRequest(method, params);
        }
    }
}
