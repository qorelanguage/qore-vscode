import { spawnSync } from 'child_process';
import { QoreLaunchConfig } from './QoreLaunchConfig';
import * as msg from './qore_message';

//! check that executable is working
export function checkExecOkResult(exec: string, args: string[] | undefined, launchOptions: any) {
    const result = spawnSync(
        exec,
        args,
        launchOptions
    );
    return result;
}

//! check that executable is working
export function checkExecOk(exec: string, args: string[] | undefined, launchOptions: any, expectedStatus: number): boolean {
    const result = checkExecOkResult(
        exec,
        args,
        launchOptions
    );
    if (result.status == expectedStatus) {
        return true;
    }
    return false;
}

//! check that Qore executable is working
export function checkQoreOk(qoreExec: string, launchOptions?): boolean {
    if (launchOptions === undefined) {
        launchOptions = { shell: true };
    } else {
        launchOptions.shell = true;
    }

    msg.logPlusConsole("Checking Qore executable: " + qoreExec);
    const result = checkExecOkResult(
        qoreExec,
        ["-l astparser -l json -ne \"int x = 1; x++;\""],
        launchOptions
    );
    if (result.status == 0) {
        msg.logPlusConsole("Qore executable ok: " + qoreExec);
        return true;
    } else {
        msg.logPlusConsole("Qore executable check failed: " + qoreExec);
        if (result.hasOwnProperty('stderr')) {
            msg.logPlusConsole("Stdout: " + result.stdout.toString());
            msg.logPlusConsole("Stderr: " + result.stderr.toString());
        }
        msg.logPlusConsole("Launch opts: ", launchOptions);
        return false;
    }
}

//! check that QoreLaunchConfig is working
export function checkQoreLaunchConfig(config: QoreLaunchConfig): boolean {
    const qoreExec = config.getQoreExec();
    const launchOptions = config.getLaunchOptions();
    return checkQoreOk(qoreExec, launchOptions);
}

//! check that Qore debugger is working
export function checkDebuggerWithLaunchConfig(config: QoreLaunchConfig, dbg: string): boolean {
    const qoreExec = config.getQoreExec();
    const launchOptions = config.getLaunchOptions();
    msg.logPlusConsole("Checking Qore debugger with Qore executable: " + qoreExec + " dbg: " + dbg);

    let res: boolean = false;
    const result = checkExecOkResult(
        qoreExec,
        [dbg, "-h"],
        launchOptions
    );
    if (result.status == 0) {
        res = true;
    } else if (result.status == 1 && /(usage|debug server)/.test(result.stdout.toString())) {
        res = true;
    }

    if (res) {
        msg.logPlusConsole("Qore debugger ok");
    } else {
        msg.logPlusConsole("Qore debugger check failed");
    }
    return res;
}
