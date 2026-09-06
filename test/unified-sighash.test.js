const { Transaction, crypto } = require("bitcoinjs-lib");
const { unifiedSighash, SigVersion } = require("../dist/helper/unified-sighash");

const path = require("path");
const FILE = process.argv[2] || "unified_sighash_0x21.json";
const vectors = require(path.join(__dirname, FILE));

function taggedHash(tag, data) {
    const tagHash = crypto.sha256(Buffer.from(tag, "utf8"));
    return crypto.sha256(Buffer.concat([tagHash, tagHash, data]));
}

function varSlice(data) {
    const len = data.length;
    let header;
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

function scriptTypeToSigVersion(st) {
    switch (st) {
        case 0: return SigVersion.BASE;
        case 1: return SigVersion.WITNESS_V0;
        case 2: return SigVersion.TAPROOT;
        case 3: return SigVersion.TAPSCRIPT;
        default: throw new Error(`unknown scriptType ${st}`);
    }
}

let pass = 0;
let fail = 0;
let errors = 0;

for (const [scriptCode, rawTx, inIdx, hashType, scriptType, spent, sighash] of vectors) {
    const tx = Transaction.fromHex(rawTx);
    const spentOutputs = spent.map(([value, spk]) => ({ value, scriptPubKey: Buffer.from(spk, "hex") }));
    const options = { scriptCode: scriptCode ? Buffer.from(scriptCode, "hex") : undefined };

    if (scriptType === 3) {
        const leaf = Buffer.from(scriptCode, "hex");
        options.tapleafHash = taggedHash("TapLeaf", Buffer.concat([Buffer.from([0xc0]), varSlice(leaf)]));
    }

    try {
        const actual = unifiedSighash(tx, inIdx, hashType, scriptTypeToSigVersion(scriptType), spentOutputs, options).toString("hex");

        if (actual === sighash) {
            pass++;
        } else {
            fail++;
            console.error(`FAIL st=${scriptType} ht=0x${hashType.toString(16).padStart(2, '0')} inIdx=${inIdx}`);
            console.error(`  expected: ${sighash}`);
            console.error(`  actual:   ${actual}`);
        }
    } catch (e) {
        errors++;
        console.error(`ERROR st=${scriptType} ht=0x${hashType.toString(16).padStart(2,'0')} inIdx=${inIdx}: ${e.message}`);
    }
}

console.log(`\n${pass}/${pass + fail + errors} unified sighash vectors passed (${fail} fail, ${errors} error).`);
if (fail > 0 || errors > 0) process.exit(1);