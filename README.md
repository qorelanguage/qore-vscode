# qore-vscode

**Qore 0.9.3+ has to be installed, including the `qdbg-vsc-adapter`, for all the functionality including the debugging support to work.**

**Qore 0.8.13+ has to be installed, including the `astparser` and `json` modules, for all the functionality to work except the debugging.**

**qore-vscode** is a [Qore](http://qore.org/) language extension for Visual Studio Code.

## Features

This extension adds support for the following:

- Syntax highlighting
- Hover info
- Goto definition
- Find references
- Document symbol search
- Workspace symbol search
- Syntax error reporting
- Debbuger, requires Qore 0.9.3 with qdbg-vsc-adapter

Most of the features (except syntax highlighting) are provided by [QLS](https://github.com/qorelanguage/qls) (Qore Language Server). In order for QLS to function properly you need to have [Qore](http://qore.org/) 0.8.13+ installed on your system, including the `astparser` and `json` modules.

## QLS Logging

If you want to log output of QLS, you can use the following configuration settings:

- `qore.useQLS` Boolean flag to turn on/off usage of QLS for providing Qore code information. [default=true]
- `qore.logging` Boolean flag to set logging on or off. [default=false]
- `qore.logFile` String specifying QLS log file path. If logging is turned on, all the operations will be logged to this file. If not defined, `~/.qls.log` is used on Unix-like systems and `%AppData%\QLS\qls.log` on Windows.
- `qore.logVerbosity` Verbosity of QLS logging. From 0 to 2. [default=0]
- `qore.appendToLog` Boolean flag specifying whether to append to QLS log file or to overwrite it on each restart. [default=true]
