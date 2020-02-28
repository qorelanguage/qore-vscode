import * as extract from 'extract-zip';
import {
    existsSync,
    readFileSync,
    removeSync,
    writeFileSync
} from 'fs-extra';
import { platform } from 'os';
import { join } from 'path';
import { t } from 'ttag';
import * as msg from './qore_message';
import { downloadFile } from './utils';

let installInProgress: boolean = false;
const PathSep = ':';

export function getLatestQoreVscPkgVersion(): string {
    return "0.9.4";
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
    let qoreModuleDir = "";
    qoreModuleDir += join(pkgPath, "lib", "qore-modules") + PathSep;
    qoreModuleDir += join(pkgPath, "lib", "qore-modules", version) + PathSep;
    qoreModuleDir += join(pkgPath, "share", "qore-modules") + PathSep;
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

function _removeQoreVscPkg(extensionPath: string): boolean {
    // remove old package if it is present
    const oldPkgPath = getQoreVscPkgPath(extensionPath);
    if (existsSync(oldPkgPath)) {
        try {
            removeSync(oldPkgPath);
        }
        catch (err) {
            msg.logPlusConsole("Failed removing previously installed package" + String(err));
            return false;
        }
    }
    return true;
}

//! internal install function for Qore VSCode package
function _installQoreVscPkg(extensionPath: string, version: string, archive: string, targetDir: string, onSuccess, onError) {
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

        // write version file
        writeFileSync(
            join(getQoreVscPkgVersionPath(extensionPath)),
            version
        );
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
    const archive = "qore-" + version + "-windows.zip";
    const uri = "https://github.com/qorelanguage/qore/releases/download/release-" + version + "/" + archive;
    const filePath = extensionPath + "/" + archive;

    const onInstallSuccess = function() {
        installInProgress = false;
        msg.info(t`QoreVscPkgInstallSuccess`);
        onSuccess();
    };
    const onInstallError = function(err) {
        installInProgress = false;
        msg.error(t`QoreVscPkgInstallFailed` + ": " + err);
        onError(err);
    };

    const onDownloadSuccess = function() {
        msg.info(t`RemovingOldQoreVscPkg`);
        if (! _removeQoreVscPkg(extensionPath)) {
            onInstallError(t`FailedRemoveOldQoreVscPkg`);
            return;
        }

        msg.info(t`InstallingQoreVscPkg`);
        _installQoreVscPkg(
            extensionPath,
            version,
            archive,
            join(extensionPath, "qore"),
            onInstallSuccess,
            onInstallError
        );
    };
    const onDownloadError = function(err) {
        installInProgress = false;
        msg.error(t`FailedDownloadQoreVscPkg` + ": " + err);
        onError(err);
    };

    msg.info(t`DloadingQoreVscPkg`);
    downloadFile(uri, filePath, onDownloadSuccess, onDownloadError);
}
