import { spawnSync } from 'child_process';
import { QoreLaunchConfig } from './QoreLaunchConfig';

//! check that executable is working
export function checkExecOkResults(exec: string, args: string[] | undefined, launchOptions: any) {
    const results = spawnSync(
        exec,
        args,
        launchOptions
    );
    return results;
}

//! check that executable is working
export function checkExecOk(exec: string, args: string[] | undefined, launchOptions: any, expectedStatus: number): boolean {
    const results = checkExecOkResults(
        exec,
        args,
        launchOptions
    );
    if (results.status == expectedStatus) {
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

    console.log("Checking Qore executable: " + qoreExec);
    let result = checkExecOk(
        qoreExec,
        ["-l astparser -l json -ne \"int x = 1; x++;\""],
        launchOptions,
        0
    );
    if (result) {
        console.log("Qore executable ok: " + qoreExec);
    } else {
        console.log("Qore executable check failed: " + qoreExec);
    }
    return result;
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
    console.log("Checking Qore debugger with Qore executable: " + qoreExec);

    let result: boolean = false;
    let results = checkExecOkResults(
        qoreExec,
        [dbg, "-h"],
        launchOptions
    );
    if (results.status == 0) {
        result = true;
    } else if (results.status == 1 && /(usage|debug server)/.test(results.stdout.toString())) {
        result = true;
    }

    if (result) {
        console.log("Qore debugger ok");
    } else {
        console.log("Qore debugger check failed");
    }
    return result;
}
