import { Transaction, crypto } from "bitcoinjs-lib";

// Script version, as the unified sighash "script type" byte defines it.
export enum SigVersion {
    BASE,
    WITNESS_V0,
    TAPROOT,
    TAPSCRIPT,
}

export const SIGHASH_ALL = 0x01;
export const SIGHASH_NONE = 0x02;
export const SIGHASH_SINGLE = 0x03;
export const SIGHASH_UNIFIED = 0x20;
export const SIGHASH_ANYONECANPAY = 0x80;

export type SpentOutput = {
    value: number;
    scriptPubKey: Buffer;
};

export type UnifiedSighashOptions = {
    scriptCode?: Buffer;
    annex?: Buffer;
    tapleafHash?: Buffer;
    codeseparatorPos?: number;
};

const TAGGED_HASH_TAG = "UnifiedSighash";

function uint8(value: number): Buffer {
    const buffer = Buffer.alloc(1);
    buffer.writeUInt8(value, 0);
    return buffer;
}

function int32LE(value: number): Buffer {
    const buffer = Buffer.alloc(4);
    buffer.writeInt32LE(value, 0);
    return buffer;
}

function uint32LE(value: number): Buffer {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32LE(value, 0);
    return buffer;
}

function uint64LE(value: number): Buffer {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32LE(value >>> 0, 0);
    buffer.writeUInt32LE(Math.floor(value / 0x100000000), 4);
    return buffer;
}

function varSlice(data: Buffer): Buffer {
    const len = data.length;
    let header: Buffer;
    if (len < 0xfd) {
        header = Buffer.alloc(1);
        header.writeUInt8(len, 0);
    } else if (len < 0x10000) {
        header = Buffer.alloc(3);
        header.writeUInt8(0xfd, 0);
        header.writeUInt16LE(len, 1);
    } else {
        header = Buffer.alloc(5);
        header.writeUInt8(0xfe, 0);
        header.writeUInt32LE(len, 1);
    }
    return Buffer.concat([header, data]);
}

const sha256 = (data: Buffer): Buffer => crypto.sha256(data);

// taggedHash("UnifiedSighash", msg) = SHA256(SHA256(tag) || SHA256(tag) || msg), per BIP340.
function taggedHashUnified(msg: Buffer): Buffer {
    const tagHash = sha256(Buffer.from(TAGGED_HASH_TAG, "utf8"));
    return sha256(Buffer.concat([tagHash, tagHash, msg]));
}

export function unifiedSighash(
    tx: Transaction,
    inIndex: number,
    hashType: number,
    sigVersion: SigVersion,
    spentOutputs: SpentOutput[],
    options: UnifiedSighashOptions = {},
): Buffer {
    const outputType = hashType & 0x1f;
    const anyoneCanPay = !!(hashType & SIGHASH_ANYONECANPAY);
    const taproot = sigVersion === SigVersion.TAPROOT || sigVersion === SigVersion.TAPSCRIPT;

    let shaPrevouts = Buffer.alloc(0);
    let shaAmounts = Buffer.alloc(0);
    let shaScripts = Buffer.alloc(0);
    let shaSequences = Buffer.alloc(0);
    if (!anyoneCanPay) {
        const prevouts: Buffer[] = [];
        const sequences: Buffer[] = [];
        for (const input of tx.ins) {
            prevouts.push(input.hash, uint32LE(input.index));
            sequences.push(uint32LE(input.sequence));
        }
        const amounts: Buffer[] = [];
        const scripts: Buffer[] = [];
        for (const spentOutput of spentOutputs) {
            amounts.push(uint64LE(spentOutput.value));
            scripts.push(varSlice(spentOutput.scriptPubKey));
        }
        shaPrevouts = sha256(Buffer.concat(prevouts));
        shaAmounts = sha256(Buffer.concat(amounts));
        shaScripts = sha256(Buffer.concat(scripts));
        shaSequences = sha256(Buffer.concat(sequences));
    }

    let shaOutputs = Buffer.alloc(0);
    if (outputType !== SIGHASH_NONE && outputType !== SIGHASH_SINGLE) {
        const outputs: Buffer[] = [];
        for (const output of tx.outs) {
            outputs.push(uint64LE(output.value), varSlice(output.script));
        }
        shaOutputs = sha256(Buffer.concat(outputs));
    }

    const msg: Buffer[] = [
        uint8(0), // epoch
        uint8(hashType), // full hash type byte, as the signature carries it
        int32LE(tx.version),
        uint32LE(tx.locktime),
        uint8(0), // locktime zero-extended to five bytes
    ];

    if (!anyoneCanPay) {
        msg.push(shaPrevouts, shaAmounts, shaScripts, shaSequences);
    }
    if (outputType !== SIGHASH_NONE && outputType !== SIGHASH_SINGLE) {
        msg.push(shaOutputs);
    }

    msg.push(uint8(sigVersion)); // script type byte

    if (anyoneCanPay) {
        const input = tx.ins[inIndex];
        const spentOutput = spentOutputs[inIndex];
        msg.push(input.hash, uint32LE(input.index));
        msg.push(uint64LE(spentOutput.value), varSlice(spentOutput.scriptPubKey));
        msg.push(uint32LE(input.sequence));
    } else {
        msg.push(uint32LE(inIndex));
    }

    if (!taproot) {
        msg.push(varSlice(options.scriptCode || Buffer.alloc(0)));
    } else {
        msg.push(uint8(options.annex ? 1 : 0));
        if (options.annex) {
            msg.push(sha256(varSlice(options.annex)));
        }
    }

    if (outputType === SIGHASH_SINGLE) {
        if (inIndex >= tx.outs.length) {
            throw new Error(`SIGHASH_SINGLE at input #${inIndex} has no matching output`);
        }
        const output = tx.outs[inIndex];
        msg.push(sha256(Buffer.concat([uint64LE(output.value), varSlice(output.script)])));
    }

    if (sigVersion === SigVersion.TAPSCRIPT) {
        msg.push(options.tapleafHash || Buffer.alloc(32));
        msg.push(uint8(0)); // key version
        msg.push(uint32LE(options.codeseparatorPos ?? 0xffffffff));
    }

    return taggedHashUnified(Buffer.concat(msg));
}