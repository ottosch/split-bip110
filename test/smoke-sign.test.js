const { Psbt, payments, networks, initEccLib } = require("bitcoinjs-lib");
const { ECPairFactory } = require("ecpair");
const ecc = require("tiny-secp256k1");
const { signInputsUnified } = require("../dist/helper/unified-signer");
const { UTXO } = require("../dist/model/utxo");
const { ScriptTypeEnum, ScriptType } = require("../dist/script-type");

initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const NETWORK = networks.bitcoin;

const privkey = Buffer.from("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f", "hex");
const pair = ECPair.fromPrivateKey(privkey);

const recipient = ECPair.fromPrivateKey(Buffer.alloc(32, 7)).publicKey;

function fakeUtxo(scriptEnum, address) {
    return new UTXO("0000000000000000000000000000000000000000000000000000000000000001", 0, 100000, address);
}

const cases = [
    { enum: ScriptTypeEnum.P2PKH, address: payments.p2pkh({ pubkey: pair.publicKey, network: NETWORK }).address },
    { enum: ScriptTypeEnum.P2SH, address: payments.p2sh({ redeem: payments.p2wpkh({ pubkey: pair.publicKey, network: NETWORK }), network: NETWORK }).address },
    { enum: ScriptTypeEnum.P2WPKH, address: payments.p2wpkh({ pubkey: pair.publicKey, network: NETWORK }).address },
    { enum: ScriptTypeEnum.P2TR, address: payments.p2tr({ internalPubkey: pair.publicKey.subarray(1), network: NETWORK }).address },
];

for (const c of cases) {
    const utxo = fakeUtxo(c.enum, c.address);
    const psbt = new Psbt({ network: NETWORK });
    const input = { hash: utxo.txid, index: utxo.vout, sequence: 0xfffffffd, witnessUtxo: { script: utxo.output, value: utxo.amount } };
    if (c.enum === ScriptTypeEnum.P2SH) {
        input.redeemScript = payments.p2wpkh({ pubkey: pair.publicKey, network: NETWORK }).output;
    } else if (c.enum === ScriptTypeEnum.P2TR) {
        input.tapInternalKey = pair.publicKey.subarray(1);
    }
    psbt.addInput(input);
    psbt.addOutput({ address: payments.p2wpkh({ pubkey: recipient, network: NETWORK }).address, value: 99900 });

    signInputsUnified(psbt, [utxo], new Map([[utxo, privkey]]));

    try {
        const tx = psbt.extractTransaction();
        console.log(`PASS ScriptTypeEnum.${c.enum} -> extract OK, vin=${tx.ins.length}, vout=${tx.outs.length}, hexLen=${tx.toHex().length / 2}`);
    } catch (e) {
        console.log(`FAIL ScriptTypeEnum.${c.enum} -> ${e.message}`);
    }
}
