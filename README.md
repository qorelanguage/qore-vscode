# qore-vscode

**Qore 0.8.13+ has to be installed, including the `astparser` module, for all the functionality to work.**

**qore-vscode** is a Qore language extension for Visual Studio Code. 

This extension adds support for the Qore language to VS Code:

- Syntax highlighting
- Hover Info
- Goto Definition
- Find References
- Document symbol search
- Workspace symbol search
- Syntax error reporting

Most of the features (except syntax highlighting) are provided by QLS (Qore Language Server). In order for QLS to function properly you need to have Qore 0.8.13+ installed on your system, including the `astparser` module.

## QLS logging

If you want to log output of QLS, you can use the following configuration settings:

- `qore.logging` Boolean flag to set logging on or off.
- `qore.logFile` String specifying the QLS log file path. If logging is turned on, all the operations will be logged to this file.
- `qore.logVerbosity` Verbosity of QLS logging. From 0 to 2.
- `qore.appendToLog` Boolean flag specifying whether to append to QLS log file or to overwrite it on each restart.