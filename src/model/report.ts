import { Tx } from "./tx";


export class Report {
    private _txs: Tx[];

    constructor(txs: Tx[]) {
        this._txs = txs;
    }

    writeReport(): string {
        const report: string[] = [];
        for (const [i, tx] of this._txs.entries()) {
            const header = `=== Transaction ${i + 1} of ${this._txs.length}`;
            const body = tx.writeReport();
            const footer = "===";

            console.log(header);
            console.log(body);
            console.log(footer);
            console.log();

            report.push(header, body, footer, "");
        }

        return report.join("\n");
    }
}