import * as fs from "fs";
import * as toml from "toml";
import { Config } from "../model/config";
import { networks, Network } from "bitcoinjs-lib";
import { bip32 } from "..";
import base58 from "bs58check";
import { BIP32Interface } from "bip32";
import { UTXOHelper } from "./utxo-helper";
import { ScriptType } from "../script-type";

export class ConfigHelper {
    private static readonly defaultAddressLimit = 2000;

    private _cfgContent: any;
    private _network = networks.bitcoin;
    private _walletXpub?: BIP32Interface;
    private _walletType = ScriptType.P2WPKH;
    private _addressLimit = 0;

    constructor(configFile: string) {
        const content = fs.readFileSync(configFile).toString();
        this._cfgContent = toml.parse(content);
    }

    parse(): Config {
        this._network = this.parseNetwork();
        this._walletXpub = this.parseXpub();
        this._walletType = this.parseWalletType();
        this._addressLimit = this.parseAddressLimit()

        const utxos = new UTXOHelper(this._cfgContent.utxo_file).parse();

        return {
            sourceWallet: {
                seed: this.parseSeed(),
                passphrase: this.parsePassphrase(),
            },
            destinationWallet: {
                xpub: this._walletXpub,
                startIndex: this.parseStartIndex(),
                scriptType: this._walletType,
            },
            addressLimit: this._addressLimit,
            feeRate: this.parseFeeRate(),
            feeVariation: this.parseFeeVariation(),
            network: this._network,
            utxos: utxos,
        };
    }

    private parseNetwork(): Network {
        const value = this._cfgContent.network || "mainnet";
        if (typeof(value) === "string") {
            const network = value as string;
            switch (network.trim().toLowerCase()) {
                case "mainnet":
                    return networks.bitcoin;
                case "testnet":
                case "signet":
                    return networks.testnet;
            }
        }

        console.error(`Invalid network: ${value}`);
        process.exit(1);
    }

    private parseXpub(): BIP32Interface {
        const value = this._cfgContent.destination_wallet?.xpub;
        if (typeof value !== "string") {
            console.error(`Invalid xpub: ${value}`);
            process.exit(1);
        }

        try {
            const xpub = this.convertToXpub(value);
            return bip32.fromBase58(xpub, this._network);
        } catch {
            console.error(`Invalid xpub: ${value}`);
            process.exit(1);
        }
    }

    private convertToXpub(value: string): string {
        if (value.startsWith("xpub") || value.startsWith("tpub")) {
            return value;
        }

        const prefix = this._network.bip32.public.toString(16).toUpperCase().padStart(8, "0"); // "xpub" or "tpub"
        const data = base58.decode(value);
        data.set(Buffer.from(prefix, "hex"), 0); // replace original prefix
        return base58.encode(data);
    }

    private parseAddressLimit(): number {
        const num = Number(this._cfgContent.source_wallet?.address_limit);
        if (!isNaN(num) && Number.isSafeInteger(num) && num >= 1) {
            return num;
        }

        return ConfigHelper.defaultAddressLimit;
    }

    private parseWalletType(): ScriptType {
        const cfgType = this._cfgContent.destination_wallet?.type as string || "segwit";
        switch (cfgType.trim().toLowerCase()) {
            case "legacy":
                return ScriptType.P2PKH;
            case "p2sh":
                return ScriptType.P2SH;
            case "segwit":
                return ScriptType.P2WPKH;
            case "taproot":
                return ScriptType.P2TR;
            default:
                console.error(`Invalid wallet type: ${cfgType}`);
                process.exit(1);
        }
    }

    private parseStartIndex(): number {
        const cfgIndex = this._cfgContent.destination_wallet.initial_index;
        const cfgAddress = this._cfgContent.destination_wallet.initial_address;

        if (cfgIndex !== undefined) {
            if (cfgAddress !== undefined) {
                console.error("initial_index and initial_address can't both be defined");
                process.exit(1);
            }

            const initialIndex = Number(String(cfgIndex));
            if (isNaN(initialIndex) || !Number.isSafeInteger(initialIndex) || initialIndex < 0) {
                console.error(`Invalid initial_index: ${cfgIndex}`);
                process.exit(1);
            }

            return initialIndex;
        }

        if (cfgAddress === undefined) {
            return 0;
        }

        if (typeof(cfgAddress) !== "string") {
            console.error(`invalid initial_address: ${cfgAddress}`);
            process.exit(1);
        }

        try {
            const addrScriptType = ScriptType.fromAddress(cfgAddress, this._network);
            addrScriptType.toPayment(cfgAddress, undefined, this._network); // validate address
            if (addrScriptType !== this._walletType) {
                throw new Error(`Types of initial_address [${addrScriptType}] and wallet [${this._walletType}] do not match`);
            }

            return this.getIndexOfInitialAddress();
        } catch (e) {
            const err = e instanceof Error ? e.message : e;
            console.error(err);
            process.exit(1);
        }
    }

    private getIndexOfInitialAddress(): number {
        const initAddr = this._cfgContent.destination_wallet.initial_address;
        const scriptType = ScriptType.fromAddress(initAddr, this._network);
        const recvXpub = this._walletXpub?.derive(0);

        for (let i = 0; i < this._addressLimit; i++) {
            const pubkey = recvXpub?.derive(i).publicKey as Buffer;
            const derivedAddress = scriptType.toPayment(undefined, pubkey, this._network).address;
            if (derivedAddress === initAddr) {
                return i;
            }
        }

        throw new Error(`${initAddr} doesn't seem to be part of the xpub. Tried first ${this._addressLimit} addresses`);
    }

    private parseFeeRate(): number {
        const value = this._cfgContent.transaction?.fee_rate || 1;

        if (typeof(value) === "number") {
            const feeRate = Number(value);
            if (!isNaN(feeRate) && isFinite(feeRate) && feeRate >= 1) {
                return feeRate;
            }
        }

        console.error(`Invalid fee rate: ${value}`);
        process.exit(1);
    }

    private parseSeed(): string {
        const value = this._cfgContent.source_wallet?.seed;
        if (typeof value !== "string" || value.trim().length === 0) {
            console.error(`Invalid or missing seed in [source_wallet]`);
            process.exit(1);
        }
        return value.trim();
    }

    private parsePassphrase(): string {
        const value = this._cfgContent.source_wallet?.passphrase;
        if (value === undefined || value === null) {
            return "";
        }
        if (typeof value !== "string") {
            console.error(`Invalid passphrase in [source_wallet]`);
            process.exit(1);
        }
        return value;
    }

    private parseFeeVariation(): number {
        const value = this._cfgContent.transaction?.fee_variation || 0;

        if (typeof(value) === "number") {
            const variation = Number(value);
            if (!isNaN(variation) && isFinite(variation) && variation >= 0) {
                return Math.trunc(variation);
            }
        }
        
        console.error(`Invalid fee variation: ${value}`);
        process.exit(1);
    }
}
