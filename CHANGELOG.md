# Changelog

## 0.8.2

- (Really) fixed the bug where the extension reported that Qore was not available when installed manually by updating to use the latest internal VSCode APIs

## 0.8.1

- Updated the module to use a Qore package build for macOS Catalina for x86_64 for maximum backwards compatibility

## 0.8.0

- Fixed a bug where the extension reported that Qore was not available when installed manually
- Updated Qore packages to use v1.16.0

## 0.7.7

- Updated qls to avoid warnings with newer versions of Qore

## 0.7.6

- Added Qore language icon to all associated Qore files

## 0.7.4

* Bump y18n from 4.0.0 to 4.0.3 (dependabot)

## 0.7.3

* Fixed automatic installation of Qore language on Windows

## 0.7.1

* Added isLangClientAvailable() to the API.
* Added the timeout argument to the API function getDocumentSymbols() - it is no longer fixed.

## 0.7.0

* Updated NPM packages to newer versions.
* Internal changes.

## 0.6.0

* Internal updates to installation of Qore VSCode Package.
* Added Qore VSCode Package for Mac OS X.
* Updated Qore VSCode Package version to 0.9.4.1.
* Made "debug adapter not found" show up in log only, instead of as an error notification.

## 0.5.3

* Updated Windows Qore VSCode Package version to 0.9.4.

## 0.5.2

* Added `.qmc` as a Qore file extension.

## 0.5.1

* Make getDocumentSymbols exported API available even when debugging is unavailable.
* Correctly handle non-string URIs in getDocumentSymbols call parameters.

## 0.5.0

* Big refactoring.
* Fixed debugging when using Qore VSCode package for Windows.
* QLS is more robust now with added validation steps.
* Vulnerability fix in https-proxy-agent npm package.

## 0.4.3

* Fixed internal parameter name in QLS.

## 0.4.2

* Added user commands for (re)installing and updating Qore VSCode package for Windows.
* Added user commands for starting and stopping QLS.

## 0.4.1

* Added auto-install of Qore VSCode package for Windows.

## 0.4.0

* Debugging support
* Find Qore script in extension dir and environment PATH.

## 0.3.3

* Fixed handling of errors happening during reading of workspace root.

## 0.3.2

* Optimized Qore syntax file.

## 0.3.1

* Fixed path and URI handling on MS Windows.
* Qore language server updated.

## 0.3.0

* Path to Qore language interpreter can be specified in settings.
* Added support for MS Windows.

## 0.2.9

* Added support for `transient` keyword syntax highlighting.

## 0.2.8

* Added support for ranges and new immediate typed hash declarations.

## 0.2.7

* Basic code snippets added.

## 0.2.6

* Added syntax highlighting for the `auto` type.

## 0.2.5

* Fixed QLS crashes caused by VS Code trying to open non-local files.
* Along with new Qore 0.8.13.1 range operator is supported.

## 0.2.4

* Configuration settings now have `window` scope and therefore cannot be defined on a per-workspace basis.

## 0.2.3

* Fixed QLS crash when hovering superclass names.

## 0.2.2

* Removed left-over QLS debug prints.

## 0.2.1

* Fixed potential QLS crash.

## 0.2.0

* Added syntax highlighting for function names.
