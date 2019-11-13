import { ServerOptions } from 'vscode-languageclient';
import { spawn, ChildProcess } from 'child_process';

//! language server options
export function getServerOptions(qoreExecutable: string, serverArgs, debugServerArgs, launchOptions?): ServerOptions {
    let serverOptions: ServerOptions;
    const DEV_MODE = false;
    if (DEV_MODE) {
        serverOptions = () => new Promise<ChildProcess>((resolve) => {
            function spawnServer(): ChildProcess {
                if (launchOptions === undefined) {
                    launchOptions = { shell: true };
                }
                else {
                    launchOptions.shell = true;
                }
                let childProcess = spawn(
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
