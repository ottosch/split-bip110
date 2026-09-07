# split-bip110

A tool to split BIP110 coins from BTC by transferring UTXOs one-to-one to new addresses of a separate wallet.

## How it works

Each UTXO is sent to a unique receive address on the destination wallet. UTXOs are **not consolidated**, except when:

- They share the same address (automatic grouping)
- They are surrounded by `[` `]` brackets in the UTXO file

Every input is signed with the [unified sighash](https://github.com/bitcoinknots/bitcoin/blob/8c85b1585dac23f964e2dd32045624de7f02aa58/doc/unified-sighash.md) (`SIGHASH_ALL | SIGHASH_UNIFIED`, hash type `0x21`), which is specific to the BIP110 chain. A transaction signed this way is **invalid on the regular BTC chain** (Bitcoin Core rejects it with "Signature hash type missing or not understood"), and therefore cannot be replayed onto it.

To check your transactions, you can verify, for example, they are **valid** on BIP110's [mempool.guide](https://mempool.guide/tx/test) and **invalid** on BTC's [mempool.space](https://mempool.space/tx/test).

## Setup

### 1. Export UTXO list from Sparrow Wallet

Export your UTXO list as a CSV file. The expected format matches Sparrow's export:

```csv
Date (UTC),Output,Address,Label,Value
2024-12-14 06:40:21,7c87ca...:2,tb1qt35r...,label,0.00333454
```

To consolidate specific UTXOs into one transaction, wrap them with brackets:

```csv
[
2024-12-14 06:40:21,7c87ca...:2,tb1qt35r...,,0.00333454
2024-12-14 06:40:21,af378d...:1,tb1q5ecv...,,0.00003000
]
```

### 2. Create a new wallet to receive your BIP110 coins

Create a new wallet to host only your BIP110 coins. Use your preferred method (Sparrow, Electrum, Iancoleman's BIP39 etc). Take note of the xpub.

### 3. Configure `config.toml`

Fill in the following fields:

```toml
# Path to the exported UTXO CSV file
utxo_file = "your-utxos.csv"

# Network: mainnet or testnet
network = "mainnet"

[source_wallet]
# Seed words of the wallet you are migrating from
seed = "word1 word2 ... wordN"
# Optional BIP39 passphrase (leave empty or omit if none)
passphrase = ""
# Max addresses to derive when searching for UTXO private keys (default: 2000)
address_limit = 2000

[destination_wallet]
# xpub of the receiving wallet
xpub = "xpub..."
# Address type: segwit, taproot, legacy, or p2sh
type = "segwit"

[transaction]
# Fee rate in sat/vb (minimum: 1, default: 1)
fee_rate = 1.03
# Random fee variation in basis points (default: 0)
fee_variation = 50
```

### 4. Run

Download the binary for your platform from the [releases](../../releases) page. Place `config.toml` and your UTXO CSV file alongside the binary, then run it.

This produces two files:

- `raw-txs.txt` — raw transaction hex (one per line)
- `tx-report.txt` — summary report with fees and amounts

## Compiling from source

```bash
npm install
npm run pkg
```

## Warning

**Always verify the generated transactions before broadcasting.** For example, make sure the destination addresses are what you expect.

**Important warning about legacy (P2PKH) wallets**: since this program runs offline, it has to fully trust the UTXO CSV file and **cannot check if the UTXO value is correct**. This is not a problem for segwit (including taproot) UTXOs, because the values are signed, but for legacy UTXOs, **you have to make sure the values are correct or part of the UTXO could be wasted in fees**. Sparrow will export the CSV file with correct values, but keep in mind this warning if you're editing the CSV file!

This software comes with no warranty. You are solely responsible for verifying that the transactions are correct. Bugs could result in loss of funds.

## Donation

If this project helped you earn something and you are feeling grateful, you can share a bit with:

- Lightning: `fiscalhawk44@walletofsatoshi.com`
- Silent Payments: `sp1qqdx6zdc0guc4ncu2wv74hhy2ql8wnxhas0hl9q8sxdxhz253c6xq5quj7kedy36lfl4yau7cph0dtzxvltzwwdutw4ct5x9clrvpkz8nxv0kpwdt`
- BIP47: `PM8TJgutCtE1GK1Lf6WUTRLzVNcBvNRXjKueKgpQ36dc6Dry3w5oCYz5NEVk7GvNpXAMdrioi6DVytk1P4RBGjXpLw1VFfTm2dNrdtTUWQCQtcjDwPVm` or PayNym: [+otto](https://paynym.rs/+otto)
- XMR: `84ASExDrrRGBgmYFCzFf6sKK4Q3gwynpzBqp3ZZfNUb4WpbAGJUJ2nrSAEfNLv3FacD5suRMLUzNCAL6XkR7bhe9QKfchu7`
- Or ask for an address on `cautious_uncrown054@simplelogin.com`.

## License

This project is free to use, copy, and modify. The author is not responsible for any bugs or issues that may cause financial loss. Use at your own risk.
