import { QLSManager } from './QLSManager';
import { Uri } from 'vscode';

export interface QoreTextDocument {
    uri: string | Uri;
    text: string;
    languageId: string;
    version: number;
}

export function getDocumentSymbolsImpl(qlsManager: QLSManager, doc: QoreTextDocument, retType?: string): any {
    // make sure uri is a string in the right format
    let uri;
    if (typeof doc.uri === 'string') {
        uri = doc.uri;
    } else {
        if (doc.uri.fsPath) {
            uri = 'file://' + doc.uri.fsPath;
        } else if (doc.uri.path) {
            uri = 'file://' + doc.uri.path;
        } else {
            return Promise.reject();
        }
    }

    // fix incorrect file:// prefix
    if (uri.match(/file:\/[^/]/)) {
        uri = 'file://' + uri.slice(5);
    }

    const newDoc = {
        uri: uri,
        text: doc.text,
        languageId: doc.languageId,
        version: doc.version
    };
    const params = {
        textDocument: newDoc,
        ... retType ? { retType } : {}
    };
    if (qlsManager.stopped()) {
        return Promise.resolve(null);
    }

    try {
        qlsManager.sendRequest('textDocument/didOpen', params);
        return qlsManager.sendRequest('textDocument/documentSymbol', params);
    }
    catch (e){
        return Promise.resolve(null);
    }
}
