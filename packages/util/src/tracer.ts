class Tracer {
    private tasks: Map<string, Map<string, { startTime: number, endTime?: number }>>;
    private logs: string[];

    constructor() {
        this.tasks = new Map<string, Map<string, { startTime: number, endTime?: number }>>();
        this.logs = [];
    }

    public startStep(taskName: string, stepName: string): void {
        const startTime = Date.now();
        if (!this.tasks.has(taskName)) {
            this.tasks.set(taskName, new Map<string, { startTime: number, endTime?: number }>());
        }

        const taskSteps = this.tasks.get(taskName)!;

        // Automatically end the previous step if it hasn't been ended yet
        for (const [step, times] of taskSteps.entries()) {
            if (times.endTime === undefined) {
                this.endStep(taskName, step);
            }
        }

        taskSteps.set(stepName, { startTime });
        this.logs.push(`Task ${taskName} - Step ${stepName} started at ${new Date(startTime).toISOString()}`);
    }

    public endStep(taskName: string, stepName: string): void {
        const endTime = Date.now();
        const task = this.tasks.get(taskName);
        if (task && task.has(stepName)) {
            const times = task.get(stepName)!;
            if (times.endTime === undefined) {
                times.endTime = endTime;
                const elapsed = endTime - times.startTime;
                this.logs.push(`Task ${taskName} - Step ${stepName} ended at ${new Date(endTime).toISOString()} (Elapsed: ${elapsed} ms)`);
            }
        } else {
            this.logs.push(`Task ${taskName} - Step ${stepName} was not started.`);
        }
    }

    public getLogs(): string[] {
        return [...this.logs];
    }

    public clearLogs(): void {
        this.logs = [];
    }
    // dump logs to console
    public dumpLogs(): void {
        console.log(this.getLogs().join('\n'));
    }

}

export const tracer = new Tracer();
