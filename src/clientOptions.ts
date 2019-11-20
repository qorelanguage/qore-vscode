import { LanguageClientOptions } from 'vscode-languageclient';
import { workspace } from 'vscode';

//! options to control the language client
export function getClientOptions(): LanguageClientOptions {
    const clientOptions: LanguageClientOptions = {
        // docs regarding documentSelector:
        // https://code.visualstudio.com/Docs/extensionAPI/vscode-api#DocumentSelector
        // https://code.visualstudio.com/Docs/extensionAPI/vscode-api#DocumentFilter
        documentSelector: [{scheme: 'file', language: 'qore'}],
        synchronize: {
            // synchronize the setting section 'qore' to the server
            configurationSection: 'qore',
            // notify the server about file changes to qore files contained in the workspace
            fileEvents: [
                workspace.createFileSystemWatcher('**/*.q'),
                workspace.createFileSystemWatcher('**/*.qm'),
                workspace.createFileSystemWatcher('**/*.qtest'),
                workspace.createFileSystemWatcher('**/*.ql'),
                workspace.createFileSystemWatcher('**/*.qc'),
                workspace.createFileSystemWatcher('**/*.qsd'),
                workspace.createFileSystemWatcher('**/*.qfd'),
                workspace.createFileSystemWatcher('**/*.qwf'),
                workspace.createFileSystemWatcher('**/*.qjob'),
                workspace.createFileSystemWatcher('**/*.qstep'),
                workspace.createFileSystemWatcher('**/*.qclass'),
                workspace.createFileSystemWatcher('**/*.qconst'),
                workspace.createFileSystemWatcher('**/*.qsm')
            ]
        }
    };
    return clientOptions;
}
