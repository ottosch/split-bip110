import { Config } from "../model/config";
import { networks } from "bitcoinjs-lib";
import { BIP32Interface } from "bip32";
import { UTXO } from "../model/utxo";
import { ScriptType } from "../script-type";

type Wallet = {
    recvXprv: BIP32Interface,
    changeXprv: BIP32Interface,
    addressMap: Map<string, Buffer>,
    scriptType: ScriptType,
    keyIndex: number,
};

type KeyPair = {
    address: string,
    privkey: Buffer,
};

type AddressType = "receive" | "change";

export class UTXOPrivkeyHelper {
    private _config: Config;
    private _rootXprv: BIP32Interface;

    private _wallets = new Map<ScriptType, Wallet>();

    constructor(config: Config, rootXprv: BIP32Interface) {
        this._config = config;
        this._rootXprv = rootXprv;
    }

    buildMap(): Map<UTXO, Buffer> {
        const utxoMap = new Map<UTXO, Buffer>();

        for (const utxoGroup of this._config.utxos) {
            utxoLoop:
            for (const utxo of utxoGroup) {
                const utxoAddress = utxo.address;
                const scriptType = ScriptType.fromAddress(utxoAddress, this._config.network);
                const wallet = this.getWallet(scriptType);
                const privKey = wallet.addressMap.get(utxoAddress)

                if (privKey) {
                    utxoMap.set(utxo, privKey);
                } else {
                    while (wallet.keyIndex < this._config.addressLimit) {
                        const recvKeyPair = this.deriveKeyPair(wallet, "receive");
                        const changeKeyPair = this.deriveKeyPair(wallet, "change");

                        wallet.addressMap.set(recvKeyPair.address, recvKeyPair.privkey);
                        wallet.addressMap.set(changeKeyPair.address, changeKeyPair.privkey);
                        wallet.keyIndex++;

                        if (recvKeyPair.address === utxoAddress) {
                            utxoMap.set(utxo, recvKeyPair.privkey);
                            continue utxoLoop;
                        } else if (changeKeyPair.address === utxoAddress) {
                            utxoMap.set(utxo, changeKeyPair.privkey);
                            continue utxoLoop;
                        }
                    }

                    const msg = `Unable to find private key of ${utxoAddress}; checked first ${this._config.addressLimit} addresses.
                    If it's deeper inside the wallet, address_limit should be increased.
                    Otherwise it's not part of this seed or uses a protocol like BIP47 or Silent Payments`;
                    console.error(msg);
                    process.exit(1);
                }
            }
        }

        return utxoMap;
    }

    private getWallet(scriptType: ScriptType): Wallet {
        let wallet = this._wallets.get(scriptType);
        if (!wallet) {
            const coinType = this._config.network === networks.bitcoin ? 0 : 1;
            wallet = {
                recvXprv: this._rootXprv.derivePath(`m/${scriptType.bip}'/${coinType}'/0'/0`),
                changeXprv: this._rootXprv.derivePath(`m/${scriptType.bip}'/${coinType}'/0'/1`),
                addressMap: new Map<string, Buffer>(),
                scriptType: scriptType,
                keyIndex: 0,
            };

            this._wallets.set(scriptType, wallet);
        }

        return wallet;
    }

    private deriveKeyPair(wallet: Wallet, addressType: AddressType): KeyPair {
        const xprv = addressType === 'receive' ? wallet.recvXprv : wallet.changeXprv;
        const privkey = xprv.derive(wallet.keyIndex);
        const network = this._config.network;

        return {
            address: wallet.scriptType.toPayment(undefined, privkey.publicKey, network).address as string,
            privkey: privkey.privateKey as Buffer,
        };
    }
}
