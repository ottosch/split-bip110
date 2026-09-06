import * as bip39 from "bip39";

export class MnemonicsHelper {
    private _bipWords: string[] = bip39.wordlists.english;
    
    private _seedWords: string;
    private _passphrase: string;

    constructor(seedWords: string) {
        this._seedWords = this.normalizeSeed(seedWords);
        this._passphrase = "";
        this.validateMnemonics();
    }

    set passphrase(passphrase: string) {
        this._passphrase = passphrase;
    }

    validateMnemonics(): void {
        if (bip39.validateMnemonic(this._seedWords)) {
            return;
        }

        const invalidWords = this._seedWords.split(" ").filter(w => !this._bipWords.includes(w));
        if (invalidWords.length >= 2) {
            console.error(`Invalid words: ${invalidWords.join(" ")}`);
        } else if (invalidWords.length === 1) {
            console.error(`Invalid word: ${invalidWords[0]}`);
        } else {
            console.error("Invalid seed: checksum mismatch");
        }

        process.exit(1);
    }

    generateSeed(): Buffer {
        return bip39.mnemonicToSeedSync(this._seedWords, this._passphrase);
    }

    private normalizeSeed(seedWords: string): string {
        return seedWords.trim().toLowerCase().replace(/\s{2,}/g, " ");
    }
}