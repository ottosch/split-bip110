import { Psbt, Transaction } from "bitcoinjs-lib";
import { UTXO } from "./utxo";


export class Tx {
    private _psbt: Psbt;
    private _utxos: UTXO[];
    private _transaction: Transaction;

    constructor(psbt: Psbt, utxos: UTXO[]) {
        this._psbt = psbt;
        this._transaction = psbt.extractTransaction();
        this._utxos = utxos;
    }

    get transaction(): Transaction {
        return this._transaction;
    }

    writeReport(): string {
        const prevouts: string[] = [];
        const addresses: string[] = [];
        const amounts: string[] = [];
        
        let inputTotal = 0;
        let maxAddrLength = 0;
        let maxAmountLength = 0;
        
        for (const utxo of this._utxos) {
            prevouts.push(utxo.prevout);
            addresses.push(`${utxo.address}`);
            if (utxo.address.length > maxAddrLength) {
                maxAddrLength = utxo.address.length;
            }
            
            amounts.push(utxo.amountFormatted);
            if (utxo.amountFormatted.length > maxAmountLength) {
                maxAmountLength = utxo.amountFormatted.length;
            }

            inputTotal += utxo.amount;
        }
        
        const report: string[] = [];
        report.push(prevouts.length === 1 ? "Coin:" : "Coins:");
        report.push(...prevouts.map(p => `  ${p}`));
        
        report.push("From:");
        for (let i = 0; i < addresses.length; i++) {
            report.push(`  ${addresses[i].padStart(maxAddrLength)}, value: ${amounts[i].padStart(maxAmountLength)} BTC`);
        }
        
        const output = this._psbt.txOutputs[0];
        const outputValue = (output.value / 1e8).toFixed(8);
        report.push("To:");
        report.push(`  ${output.address}`);
        report.push(`  Value: ${outputValue} BTC`);

        const size = this._transaction.virtualSize();
        const fee = this._psbt.getFee();
        const feeRate = fee / size;
        
        const feePercent = (fee / inputTotal) * 100;
        const threshold = 0.01;
        const feePercentStr = feePercent < threshold ? `less than ${threshold}` : feePercent.toFixed(2);
        report.push("Fee:");
        report.push(`  Tx size: ${size} vb`);
        report.push(`  Fee: ${fee} sats`);
        report.push(`  Fee rate: ${feeRate.toFixed(3)} sat/vb`);
        report.push(`  Fee %: ${feePercentStr}%`);

        return report.join("\n");
    }
}