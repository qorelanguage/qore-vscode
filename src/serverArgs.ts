import { join } from 'path';
import { findScript } from './utils';

//! get arguments for starting QLS
export function getServerArgs(extensionPath: string): string[] {
    return [findScript(extensionPath, join("qls", "qls.q"))];
}
