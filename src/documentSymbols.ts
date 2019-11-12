import { QLSManager } from './QLSManager';

export interface QoreTextDocument {
    uri: string;
    text: string;
    languageId: string;
    version: number;
}

export function getDocumentSymbolsImpl(qlsManager: QLSManager, doc: QoreTextDocument, retType?: string): any {
    const params = {
        textDocument: doc,
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
