import { spawnSync } from 'child_process';
import {
    getQoreVscPkgEnv,
    getQoreVscPkgQoreExecutable,
} from './qoreVscPkg';

//! check that Qore is working
export function checkQoreOk(qoreExecutable: string, launchOptions?): boolean {
    if (launchOptions == undefined) {
        launchOptions = { shell: true };
    } else {
        launchOptions.shell = true;
    }

    console.log("Checking Qore executable: " + qoreExecutable);
    const results = spawnSync(
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
export function checkQoreVscPkgOk(extensionPath: string): boolean {
    const qoreExecutable = getQoreVscPkgQoreExecutable(extensionPath);
    const env = getQoreVscPkgEnv(extensionPath);
    return checkQoreOk(qoreExecutable, { env: env });
}

//! check that Qore debugger is working
export function checkDebuggerOk(qoreExecutable: string, dbg: string): boolean {
    console.log("Checking Qore debugger with Qore executable: " + qoreExecutable);
    let results = spawnSync(
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
