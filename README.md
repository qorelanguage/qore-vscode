# qore-vscode

**qore-vscode** is an extension for Visual Studio Code adding
[Qore](http://qore.org/) language support.

## Version 0.8.2 (2023-06-26)

- (Really) fixed the bug where the extension reported that Qore was not available when installed manually by updating to use the latest internal VSCode APIs

## Version 0.8.1 (2023-06-06)

- Updated the module to use a Qore package build for macOS Catalina for x86_64 for maximum backwards compatibility

## Version 0.8.0 (2023-05-25)

- Fixed a bug where the extension reported that Qore was not available when installed manually
- Updated Qore packages to use v1.16.0

## Version 0.7.7 (2022-05-10)

- Updated qls to avoid warnings with newer versions of Qore

## Version 0.7.6 (2022-05-10)

- Added Qore language icon to all associated Qore files

## Dependencies

**Qore 0.9.3+ has to be installed, including the `qdbg-vsc-adapter`, for all the functionality including the debugging support to work.**

**Qore 0.8.13+ has to be installed, including the `astparser` and `json` modules, for all the functionality to work except the debugging.**

On Windows and macOS, if you don't have Qore installed, a warning message will be shown
when the extension is activated asking you if you want to download the
Qore VSCode package. If you select "Yes", a Qore package will be downloaded
and installed into the extension directory. This will provide Qore
and necessary modules for the Qore Language Server to run.

## Features

This extension adds support for the following:

- Syntax highlighting
- Hover info
- Goto definition
- Find references
- Document symbol search
- Workspace symbol search
- Syntax error reporting
- Debbuger, requires Qore 0.9.3+ with `qdbg-vsc-adapter`

Most of the features (except syntax highlighting) are provided by
[QLS](https://github.com/qorelanguage/qls) (Qore Language Server).
In order for QLS to function properly you need to have [Qore](http://qore.org/) 0.8.13+
installed on your system, including the `astparser` and `json` modules.

## QLS Logging

If you want to log output of QLS, you can use the following configuration settings:

- `qore.useQLS` Boolean flag to turn on/off usage of QLS for providing Qore code information. [default=true]
- `qore.logging` Boolean flag to set logging on or off. [default=false]
- `qore.logFile` String specifying QLS log file path. If logging is turned on, all the operations will be logged to this file. If not defined, `~/.qls.log` is used on Unix-like systems and `%AppData%\QLS\qls.log` on Windows.
- `qore.logVerbosity` Verbosity of QLS logging. From 0 to 2. [default=0]
- `qore.appendToLog` Boolean flag specifying whether to append to QLS log file or to overwrite it on each restart. [default=true]

## Debugging

The sessions are configured in `launch.json` file referenced from `Debug` view.
The extension implements *qore* debugging type. Debugger can execute Qore script
in local debug host or attach to a remote *qdbg-server* host.

In the first case the `request` value is *launch* and `program` specifies Qore
script filename. In latter case the `request` value is *attach* and `connection`
specifies URL to connect to and `program` is program name to be debugged.

Note that VSCode macros and commands are expanded. The extension implements
`${command:AskForFilename}` for *launch* case and `${command:AskForConnection}`,
`${command:AskForProgram}` for *attach* case to specify value when debugging
session is started.

To start debugging prepare launch file, select a configuration from drop-down
menu and click `Start debugging`. When specified program is executed the
extension is notified, the program interrupted and then user can start stepping
the code, inspecting stack, variables, etc. To leave program stepping press `F5`.

The launch file data structure is explained by the following example:

```
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "qore",
            "request": "launch",
            "name": "Ask for file name",
            "program": "${workspaceFolder}/${command:AskForFilename}"
        },
        {
            "type": "qore",
            "request": "attach",
            "name": "Ask for conection and program",
            "connection": "${command:AskForConnection}",
            "program": "${command:AskForProgram}"
        },
        {
            "type": "qore",
            "request": "launch",
            "name": "Launch test-basic.q",
            "program": "test-basic.q",
        },
        {
            "type": "qore",
            "request": "attach",
            "name": "Attach test-program",
            "connection": "ws://localhost:8001",
            "program": "test-program",
        }
    ]
}
```
