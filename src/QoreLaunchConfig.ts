export class QoreLaunchConfig {
    //! qore executable
    private _qoreExec: string = "qore";

    //! env needed for launching qore
    private _launchEnv: object | undefined = undefined;

    constructor(qoreExec: string, launchEnv?: object | undefined) {
        this._qoreExec = qoreExec;
        this._launchEnv = launchEnv;
    }

    getQoreExec(): string {
        return this._qoreExec;
    }

    getLaunchEnv(): object | undefined {
        return this._launchEnv;
    }

    getLaunchOptions(): object | undefined {
        if (this._launchEnv === undefined) {
            return {
                shell: true
            };
        }
        return {
            env: this._launchEnv,
            shell: true
        };
    }
}
