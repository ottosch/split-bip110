import * as fs from "fs";
import { UTXO } from "../model/utxo";

export class UTXOHelper {
    private readonly regexPrevout = /^[0-9a-f]{64}:\d+$/;
    private readonly regexAddress = /^(1|3|m|n|2|bc1|tb1)\w{20,}$/;
    private readonly regexAmount = /^(\d+\.)?\d+$/;

    private utxoContent: string;

    constructor(utxoFile: string) {
        this.utxoContent = fs.readFileSync(utxoFile).toString().trim();
    }

    parse(): UTXO[][] {
        const utxos: UTXO[][] = [];
        const mapAddressIndex = new Map<string, number>();

        const lines = this.utxoContent.split("\n");

        let insideUtxoGroup = false;
        let groupIndex = -1;

        for (let [i, line] of lines.entries()) {
            const lineNumber = i + 1;
            line = line.trim();

            if (!line || line[0] === "#" || line.startsWith("Date")) {
                continue;
            }

            const openingBracket = line[0] === "[";
            const closingBracket = line[0] === "]";
            if (openingBracket || closingBracket) {
                if (line.length >= 2) {
                    console.error(`Error on line ${lineNumber}: bracket should be the only character`);
                    process.exit(1);
                }

                if ((openingBracket && insideUtxoGroup) || (closingBracket && !insideUtxoGroup)) {
                    console.error(`Error on line ${lineNumber}: unmatched brackets`);
                    process.exit(1);
                }

                insideUtxoGroup = openingBracket;
                groupIndex = -1;
                continue;
            }

            const tokens = line.split(",");
            if (tokens.length < 4) {
                console.error(`Error on line ${lineNumber}: invalid line`);
                process.exit(1);
            }

            let txid = "";
            let vout = 0;
            let amount = 0;
            let address = "";

            for (const token of tokens) {
                const prevoutMatch = this.regexPrevout.exec(token);
                if (prevoutMatch) {
                    const matchTokens = prevoutMatch[0].split(":");
                    txid = matchTokens[0];
                    vout = parseInt(matchTokens[1]);
                    continue;
                }

                const addressTypeMatch = this.regexAddress.exec(token);
                if (addressTypeMatch) {
                    address = addressTypeMatch[0];
                    continue;
                }

                const amountMatch = this.regexAmount.exec(token);
                if (amountMatch) {
                    amount = Math.round(parseFloat(amountMatch[0]) * 1e8);
                }
            }

            const u = new UTXO(txid, vout, amount, address);

            if (!txid || !address || amount === 0) {
                console.error(`Error on line ${lineNumber}: failed to parse UTXO (txid=${txid}, vout=${vout}, amount=${amount}, address=${address})`);
                process.exit(1);
            }

            // UTXO will be inserted:
            // - If the line is inside brackets, in the group enclosed by them
            // - If there's address reuse, with the other address' UTXO
            // - Otherwise, alone
            if (insideUtxoGroup) {
                if (groupIndex === -1) { // first of the group, add to UTXO array
                    utxos.push([u]);
                    groupIndex = utxos.length - 1;
                } else { // group already exists, use it
                    utxos[groupIndex].push(u);
                }
            } else {
                const addrIndex = mapAddressIndex.get(address);
                if (addrIndex !== undefined) { // address has been seen before, add to group
                    utxos[addrIndex].push(u);
                } else { // will go alone for now
                    utxos.push([u]);
                    mapAddressIndex.set(address, utxos.length - 1);
                }
            }
        }

        if (insideUtxoGroup) {
            console.error('Unmatched brackets: group not closed');
            process.exit(1);
        }

        return utxos;
    }
}
