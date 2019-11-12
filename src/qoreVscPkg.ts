import * as extract from 'extract-zip';
import {
    existsSync,
    readFileSync,
    removeSync,
    renameSync,
    writeFileSync
} from 'fs-extra';
import { platform } from 'os';
import { join } from 'path';
import { t } from 'ttag';
import * as msg from './qore_message';
import { downloadFile } from './utils';

let installInProgress: boolean = false;

export function getLatestQoreVscPkgVersion(): string {
    return "0.9.0";
}

//! get path to Qore VSCode package dir
export function getQoreVscPkgPath(extensionPath: string): string {
    return join(extensionPath, "qore");
}

//! get path to Qore VSCode package version file
export function getQoreVscPkgVersionPath(extensionPath: string): string {
    return join(getQoreVscPkgPath(extensionPath), "pkg-ver.txt");
}

//! get path to Qore executable in Qore VSCode package
export function getQoreVscPkgQoreExecutable(extensionPath: string): string {
    if (platform() == "win32") {
        return join(getQoreVscPkgPath(extensionPath), "bin", "qore.exe");
    }
    return join(getQoreVscPkgPath(extensionPath), "bin", "qore");
}

//! Is Qore VSCode package installed?
export function isQoreVscPkgInstalled(extensionPath: string): boolean {
    if (!existsSync(getQoreVscPkgPath(extensionPath))) {
        return false;
    }
    if (!existsSync(getQoreVscPkgQoreExecutable(extensionPath))) {
        return false;
    }
    return true;
}

//! get QORE_MODULE_DIR variable for using Qore VSCode package
export function getQoreVscPkgModuleDirVar(extensionPath: string): string {
    const version = getLatestQoreVscPkgVersion();
    const pkgPath = getQoreVscPkgPath(extensionPath);
    const sep = (platform() == "win32") ? ";" : ":";
    let qoreModuleDir = "";
    qoreModuleDir += join(pkgPath, "lib", "qore-modules") + sep;
    qoreModuleDir += join(pkgPath, "lib", "qore-modules", version) + sep;
    qoreModuleDir += join(pkgPath, "share", "qore-modules") + sep;
    qoreModuleDir += join(pkgPath, "share", "qore-modules", version);
    return qoreModuleDir;
}

//! get env var settings for using Qore VSCode package
export function getQoreVscPkgEnv(extensionPath: string): object {
    const env = {
        PATH: process.env.PATH,
        QORE_MODULE_DIR: getQoreVscPkgModuleDirVar(extensionPath)
    };
    return env;
}

//! get version of the installed Qore VSCode package, if it is installed
export function getInstalledQoreVscPkgVersion(extensionPath: string): string | undefined {
    if (!isQoreVscPkgInstalled(extensionPath)) {
        return undefined;
    }
    let verString: any = undefined;
    try {
        verString = readFileSync(
            getQoreVscPkgVersionPath(extensionPath),
            { encoding: 'utf8' }
        );
    }
    catch (err) {
        return undefined;
    }
    return verString;
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
            renameSync(
                join(targetDir, extractedName),
                join(targetDir, "qore")
            );
        }
        catch (e) {
            const message = t`FailedRenameQoreVscPkg`;
            msg.logPlusConsole(message + ': ' + e);
            onError(message);
            return;
        }
        writeFileSync(
            join(getQoreVscPkgVersionPath(extensionPath)),
            version
        );
        msg.logPlusConsole(t`QoreVscPkgInstallOk`);
        onSuccess();
    });
}

//! download and install Qore VSCode package
export function installQoreVscPkg(extensionPath: string, onSuccess, onError) {
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

    // remove old package if it is present
    const pkgPath = getQoreVscPkgPath(extensionPath);
    if (existsSync(pkgPath)) {
        try {
            removeSync(pkgPath);
        }
        catch (err) {
            msg.logPlusConsole("Failed removing previously installed package" + String(err));
        }
    }

    msg.info(t`DloadingQoreVscPkg`);
    downloadFile(uri, filePath, onDownloadSuccess, onDownloadError);
}
