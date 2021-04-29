import * as extract from 'extract-zip';
import {
    existsSync,
    readFileSync,
    removeSync,
    writeFileSync
} from 'fs-extra';
import { platform } from 'os';
import { join } from 'path';
import * as sudo from 'sudo-prompt';
import { t } from 'ttag';
import * as msg from './qore_message';
import { downloadFile } from './utils';

let installInProgress: boolean = false;

const PathSep = ':';
const VersionFile = 'pkg-ver.txt';

export function plaformHasQoreVscPkg(): boolean {
    return (platform() == 'win32') || (platform() == 'darwin');
}

export function getLatestQoreVscPkgVersion(): string {
    return '0.9.14';
}

//! get path to Qore VSCode package dir
export function getQoreVscPkgPath(extensionPath: string): string {
    if (platform() == 'darwin') {
        return '/opt/qore';
    }
    return join(extensionPath, 'qore');
}

//! get path to Qore VSCode package version file
export function getQoreVscPkgVersionPath(extensionPath: string): string {
    return join(getQoreVscPkgPath(extensionPath), VersionFile);
}

//! get path to Qore executable in Qore VSCode package
export function getQoreVscPkgQoreExecutable(extensionPath: string): string {
    if (platform() == 'win32') {
        return join(getQoreVscPkgPath(extensionPath), 'bin', 'qore.exe');
    }
    return join(getQoreVscPkgPath(extensionPath), 'bin', 'qore');
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
    let qoreModuleDir = '';
    qoreModuleDir += join(pkgPath, 'lib', 'qore-modules') + PathSep;
    qoreModuleDir += join(pkgPath, 'lib', 'qore-modules', version) + PathSep;
    qoreModuleDir += join(pkgPath, 'share', 'qore-modules') + PathSep;
    qoreModuleDir += join(pkgPath, 'share', 'qore-modules', version);
    return qoreModuleDir;
}

//! get LD_LIBRARY_PATH variable for using Qore VSCode package
export function getQoreVscPkgLdLibPathVar(extensionPath: string): string {
    const pkgPath = getQoreVscPkgPath(extensionPath);
    let libPath = '';
    libPath += join(pkgPath, 'lib');
    return libPath;
}

//! get env var settings for using Qore VSCode package
export function getQoreVscPkgEnv(extensionPath: string): object {
    const env = {
        PATH: process.env.PATH,
        QORE_MODULE_DIR: getQoreVscPkgModuleDirVar(extensionPath),
        LD_LIBRARY_PATH: getQoreVscPkgLdLibPathVar(extensionPath)
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

async function _removeMacQoreVscPkg(extensionPath: string): Promise<boolean> {
    // remove old package if it is present
    const optPkgPath = getQoreVscPkgPath(extensionPath);
    if (existsSync(optPkgPath)) {
        return new Promise<boolean>((resolve, _reject) => {
            sudo.exec('rm -rf /opt/qore', { name: 'Qore VS Code' }, 
                function(error, _stdout, stderr) {
                    if (error) {
                        const message = t`FailedRemoveOldQoreVscPkg`;
                        msg.logPlusConsole(message + ': ' + error);
                        msg.logPlusConsole('stderr: ' + stderr);
                        resolve(false);
                        return;
                    }
                    resolve(true);
                }
            );
        });
    }
    return true;
}

function _removeExtDirQoreVscPkg(extensionPath: string): boolean {
    // remove old package if it is present
    const oldPkgPath = getQoreVscPkgPath(extensionPath);
    if (existsSync(oldPkgPath)) {
        try {
            removeSync(oldPkgPath);
        }
        catch (err) {
            msg.logPlusConsole('Failed removing previously installed package' + String(err));
            return false;
        }
    }
    return true;
}

async function _removeOldQoreVscPkg(extensionPath: string): Promise<boolean> {
    if (platform() == 'darwin') {
        return _removeMacQoreVscPkg(extensionPath);
    }
    return _removeExtDirQoreVscPkg(extensionPath);
}

async function _installMacQoreVscPkg(extensionPath: string, version: string, archive: string, onSuccess, onError) {
    const archivePath = join(extensionPath, archive);

    // unzip archive
    try {
        await extract(archivePath, {dir: extensionPath});
    } catch (err) {
        const message = t`FailedExtractionQoreVscPkg`;
        msg.logPlusConsole(message + ': ' + err);
        onError(message);
        return;
    }
    msg.logPlusConsole(t`ExtractedQoreVscPkg`);

    // write version file
    writeFileSync(join(extensionPath, 'qore', VersionFile), version);

    // move the qore package to /opt
    sudo.exec('mv ' + join(extensionPath, 'qore') + ' /opt/', { name: 'Qore VS Code' },
        function(error, _stdout, stderr) {
            if (error) {
                const message = t`FailedMoveOptQoreVscPkg`;
                msg.logPlusConsole(message + ': ' + error);
                msg.logPlusConsole('stderr: ' + stderr);
                onError(message);
                return;
            }
            onSuccess();
        }
    );
}

//! internal install function for Qore VSCode package
async function _installQoreVscPkg(extensionPath: string, version: string, archive: string, onSuccess, onError) {
    const archivePath = join(extensionPath, archive);

    // unzip archive
    try {
        await extract(archivePath, {dir: join(extensionPath, 'qore')});
    } catch (err) {
        const message = t`FailedExtractionQoreVscPkg`;
        msg.logPlusConsole(message + ': ' + err);
        onError(message);
        return;
    }
    msg.logPlusConsole(t`ExtractedQoreVscPkg`);

    // write version file
    writeFileSync(join(getQoreVscPkgVersionPath(extensionPath)), version);

    onSuccess();
}

//! download and install Qore VSCode package
export async function installQoreVscPkg(extensionPath: string, onSuccess, onError) {
    if (!plaformHasQoreVscPkg()) {
        return;
    }
    if (installInProgress) {
        msg.warning(t`InstallAlreadyInProgress`);
        return;
    }
    installInProgress = true;

    const version = getLatestQoreVscPkgVersion();
    let archive: string = '';
    let uri: string = '';
    if (platform() == 'win32') {
        archive = 'qore-' + version + '-windows.zip';
        uri = 'https://github.com/qorelanguage/qore/releases/download/release-' + version + '/' + archive;
    } else if (platform() == 'darwin') {
        // https://qoretechnologies.com/download/qore-0.9.4.1-macos-10.15.3-Catalina-opt-qore.zip
        archive = 'qore-0.9.4.1-macos-10.15.3-Catalina-opt-qore.zip';
        uri = 'https://qoretechnologies.com/download/' + archive;
    }
    const filePath = join(extensionPath, archive);

    const onInstallSuccess = function() {
        installInProgress = false;
        msg.info(t`QoreVscPkgInstallSuccess`);
        onSuccess();
    };
    const onInstallError = function(err) {
        installInProgress = false;
        msg.error(t`QoreVscPkgInstallFailed` + ": " + err.toString());
        onError(err);
    };

    const onDownloadSuccess = async function() {
        msg.info(t`RemovingOldQoreVscPkg`);
        if (! await _removeOldQoreVscPkg(extensionPath)) {
            onInstallError(t`FailedRemoveOldQoreVscPkg`);
            return;
        }

        msg.info(t`InstallingQoreVscPkg`);
        if (platform() == 'darwin') {
            _installMacQoreVscPkg(
                extensionPath,
                version,
                archive,
                onInstallSuccess,
                onInstallError
            );
        } else {
            _installQoreVscPkg(
                extensionPath,
                version,
                archive,
                onInstallSuccess,
                onInstallError
            );
        }
    };
    const onDownloadError = function(err) {
        installInProgress = false;
        msg.error(t`FailedDownloadQoreVscPkg` + ": " + err);
        onError(err);
    };

    msg.info(t`DloadingQoreVscPkg`);
    downloadFile(uri, filePath, onDownloadSuccess, onDownloadError);
}
