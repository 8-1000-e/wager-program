# BLAME Wager Program - Integration Guide

Solana program for the BLAME mini-games app. Handles SOL wagers, escrow, and settlement on-chain.

**Program ID:** `4a48fH7tECz8ZPKCixUqGrvc1JqNk6FaivPxF2W4krpt`

**Network:** Devnet

**Status:** Deployed and initialized on devnet. FeePool is live — no need to call `init_fee_pool`.

**IDL Account:** `2PoZTjR8orb3SmYJLxoRrzbRRwUYDg6nASWCngZhu6Zv`

**Deploy tx:** `3zvWcyZw5AVygcTs18kVqEJwGCvAJociNJH4CQMLmgPosZk6X6ku7a82qzcL3yBRwCKgP7DYtrhaupmpjUpS14Xd`

---

## Table of Contents

1. [Concept](#concept)
2. [Architecture Overview](#architecture-overview)
3. [On-Chain Accounts (PDAs)](#on-chain-accounts-pdas)
4. [Game Lifecycle - Normal Mode](#game-lifecycle---normal-mode)
5. [Game Lifecycle - CoinFlip Mode](#game-lifecycle---coinflip-mode)
6. [All Instructions Reference](#all-instructions-reference)
7. [PDA Derivation (How to Compute Addresses)](#pda-derivation-how-to-compute-addresses)
8. [Remaining Accounts Pattern](#remaining-accounts-pattern)
9. [Constants](#constants)
10. [Error Codes](#error-codes)
11. [Integration Checklist for Flutter](#integration-checklist-for-flutter)

---

## Concept

Players wager SOL on mini-games. The program escrows the SOL in vault PDAs, and when the game ends, the winner gets the pot minus a small fee.

**Key design:** Players do NOT connect a wallet in the app. They deposit SOL externally (from Phantom or any wallet) to their vault PDA address. The app uses a local keypair (`app_host`) to sign all program transactions.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    BLAME App (Flutter)                │
│                                                       │
│  app_host keypair (local) signs all program calls     │
│  Players deposit from Phantom → vault PDA address     │
└───────────────┬───────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────┐
│               Wager Program (Solana)                  │
│                                                       │
│  FeePool PDA ─── collects fees (5000 lamports each)   │
│  Game PDA ────── game state (players, status, etc.)   │
│  Vault PDAs ──── one per player per game (escrow)     │
└───────────────────────────────────────────────────────┘
```

---

## On-Chain Accounts (PDAs)

### FeePool
- **Seeds:** `["fee_pool"]`
- **Created once** via `init_fee_pool`
- Collects 5000 lamports fee per vault at settlement
- Fields: `authority` (Pubkey), `bump` (u8)

### Game
- **Seeds:** `["game", game_id (u64 LE bytes)]`
- One per game session
- Fields:
  - `game_id`: u64 — unique identifier you choose (e.g. timestamp or counter)
  - `app_host`: Pubkey — the app keypair that created the game (only this key can call most instructions)
  - `wager_amount`: u64 — amount each player must deposit (in lamports)
  - `players`: Vec<Pubkey> — list of player wallet addresses (max 5)
  - `status`: GameStatus — current state (see lifecycle below)
  - `created_at`: i64 — unix timestamp
  - `game_type`: GameType — `Normal` or `CoinFlip`
  - `bump`: u8

### Vault
- **Seeds:** `["vault", game_pda_pubkey, player_wallet_pubkey]`
- One per player per game
- Created automatically when `register_player` is called
- Players deposit SOL here externally (standard SOL transfer from their wallet)
- Fields: `bump` (u8)

---

## Game Lifecycle - Normal Mode

This is the standard flow for all games (TicTacToe, Connect Four, Battleship, etc.) where the app determines the winner.

```
  ┌──────────┐     ┌──────────────┐     ┌──────────┐
  │  create   │ ──▶ │  register x2 │ ──▶ │   lock    │
  │  game     │     │  (+ players) │     │   game    │
  └──────────┘     └──────────────┘     └──────────┘
   Status: Open      Status: Open        Status: Locked
                                              │
                 Players deposit SOL          │
                 to their vault PDAs          │
                 from Phantom                 │
                                              ▼
                                         ┌──────────┐
                                         │  start    │
                                         │  game     │
                                         └──────────┘
                                          Status: Active
                                              │
                              ┌───────────────┤
                              ▼               ▼
                         ┌──────────┐    ┌──────────┐
                         │  settle   │    │  cancel   │
                         │ (winner)  │    │ (timeout) │
                         └──────────┘    └──────────┘
                       Status: Settled  Status: Cancelled
```

### Step by step:

#### 1. `create_game(game_id, wager_amount, game_type)`
- **Who calls:** app_host
- **What it does:** Creates the Game PDA
- **Args:**
  - `game_id`: u64 — unique ID for this game
  - `wager_amount`: u64 — lamports each player must deposit (must be > 5000)
  - `game_type`: `{ Normal: {} }` or `{ CoinFlip: {} }`
- **Accounts:**
  - `payer`: app_host (Signer, mut)
  - `game`: the Game PDA (will be created)
  - `systemProgram`: System Program

#### 2. `register_player(player)` — call once per player
- **Who calls:** app_host
- **What it does:** Adds the player to the game + creates their vault PDA
- **Args:**
  - `player`: Pubkey — the player's wallet address
- **Accounts:**
  - `payer`: app_host (Signer, mut)
  - `vault`: the Vault PDA for this player (will be created)
  - `game`: the Game PDA (mut)
  - `systemProgram`: System Program
- **After this:** Tell the player to send `wager_amount` SOL to their vault PDA address. They do this from Phantom as a normal SOL transfer.

#### 3. `lock_game`
- **Who calls:** app_host
- **What it does:** Locks the game so no more players can join. Requires at least 2 players.
- **Accounts:**
  - `payer`: app_host (Signer, mut)
  - `game`: the Game PDA (mut)

#### 4. `start_game`
- **Who calls:** app_host
- **What it does:** Verifies all vaults have enough SOL deposited, then sets status to Active
- **Accounts:**
  - `payer`: app_host (Signer, mut)
  - `game`: the Game PDA (mut)
- **Remaining accounts:** One vault PDA per player, in the same order as `game.players[]`
  - Each vault must hold >= `wager_amount + rent` lamports

#### 5a. `settle(winner_index)`
- **Who calls:** app_host (when the game determines a winner)
- **What it does:** Sends all vault SOL to the winner (minus fees), closes vaults
- **Args:**
  - `winner_index`: u8 — index of the winner in `game.players[]` (0-based)
- **Accounts:**
  - `payer`: app_host (Signer, mut)
  - `game`: the Game PDA (mut)
  - `feePool`: the FeePool PDA (mut)
- **Remaining accounts:** All vault PDAs (in order of `game.players[]`) + the winner's wallet as the last account
  - Example for 2 players where player 0 wins: `[vault_0, vault_1, wallet_0]`

#### 5b. `cancel` (alternative to settle)
- **Who calls:** app_host (or anyone after timeout)
- **What it does:** Refunds each player's vault SOL back to them. Only works after 30 minutes.
- **Accounts:**
  - `payer`: app_host (Signer, mut)
  - `game`: the Game PDA (mut)
  - `feePool`: the FeePool PDA (mut)
- **Remaining accounts:** Alternating vault PDA + player wallet pairs
  - Example for 2 players: `[vault_0, wallet_0, vault_1, wallet_1]`

---

## Game Lifecycle - CoinFlip Mode

For the CoinFlip game mode, the winner is determined by on-chain VRF (Verifiable Random Function) instead of the app. This is trustless — neither player nor the app can cheat.

```
  create_game ──▶ register x2 ──▶ lock ──▶ start ──▶ request_coinflip
  (CoinFlip)                                              │
                                                          ▼
                                                   VRF Oracle calls
                                                   settle_coinflip
                                                          │
                                                          ▼
                                                     Status: Settled
                                                   (winner gets pot)
```

The flow is identical to Normal mode up to `start_game`. Then instead of the app calling `settle`, you call:

#### `request_coinflip`
- **Who calls:** app_host
- **What it does:** Sends a VRF randomness request to MagicBlock's oracle. Automatically derives vault PDAs, fee_pool, and player wallets from `game.players[]` and passes them as callback accounts so the oracle can call `settle_coinflip` with all needed accounts.
- **Requirements:** Game must be Active + GameType must be CoinFlip + exactly 2 players
- **Accounts:**
  - `payer`: app_host (Signer, mut)
  - `game`: the Game PDA (mut)
  - `oracleQueue`: MagicBlock DEFAULT_QUEUE `Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh` (mut, address-constrained)
  - Plus VRF-specific accounts added by the `#[vrf]` macro (program_identity, system_program, slot_hashes, vrf_program)
- **Oracle response time:** ~5 seconds on devnet

#### `settle_coinflip(randomness)` — called automatically by the VRF oracle
- **You do NOT call this.** The oracle calls it automatically with the random result.
- **What it does:** Uses `random_bool` on the randomness to pick player 0 or player 1 as winner, then distributes the pot
- **Accounts are resolved automatically:** `request_coinflip` passes all needed accounts (game, fee_pool, vault_0, vault_1, player_0, player_1, system_program) via `accounts_metas` in the VRF request. The oracle injects them into the callback — no remaining_accounts needed.

---

## All Instructions Reference

| # | Instruction | Args | Who Calls | GameType | Required Status |
|---|------------|------|-----------|----------|-----------------|
| 1 | `init_fee_pool` | none | app_host (once) | any | N/A |
| 2 | `create_game` | game_id (u64), wager_amount (u64), game_type | app_host | any | N/A |
| 3 | `register_player` | player (Pubkey) | app_host | any | Open |
| 4 | `lock_game` | none | app_host | any | Open |
| 5 | `start_game` | none | app_host | any | Locked |
| 6 | `settle` | winner_index (u8) | app_host | Normal | Active |
| 7 | `cancel` | none | app_host | any | not Settled/Cancelled + 30min timeout |
| 8 | `claim_fees` | none | app_host (authority) | N/A | N/A |
| 9 | `request_coinflip` | none | app_host | CoinFlip | Active |
| 10 | `settle_coinflip` | randomness ([u8; 32]) | VRF oracle | CoinFlip | Active |
| 11 | `delegate_game` | game_id (u64) | app_host | any | any |
| 12 | `schedule_auto_cancel` | task_id (i64) | app_host | any | any |
| 13 | `undelegate_game` | none | app_host | any | any |

---

## PDA Derivation (How to Compute Addresses)

You need to compute PDA addresses client-side to pass them as accounts. Here's how to derive each one:

### Dart / Flutter (using `solana` package)

```dart
import 'package:solana/solana.dart';

final programId = Ed25519HDPublicKey.fromBase58('4a48fH7tECz8ZPKCixUqGrvc1JqNk6FaivPxF2W4krpt');

// FeePool PDA
final feePoolSeeds = [utf8.encode('fee_pool')];
final feePoolPda = await Ed25519HDPublicKey.findProgramAddress(
  seeds: feePoolSeeds,
  programId: programId,
);

// Game PDA
final gameId = 12345; // your game_id as u64
final gameIdBytes = ByteData(8)..setUint64(0, gameId, Endian.little);
final gamePda = await Ed25519HDPublicKey.findProgramAddress(
  seeds: [utf8.encode('game'), gameIdBytes.buffer.asUint8List()],
  programId: programId,
);

// Vault PDA (for a specific player in a specific game)
final vaultPda = await Ed25519HDPublicKey.findProgramAddress(
  seeds: [
    utf8.encode('vault'),
    gamePda.bytes,          // game PDA pubkey bytes
    playerWallet.bytes,     // player wallet pubkey bytes
  ],
  programId: programId,
);
```

### TypeScript (using @coral-xyz/anchor)

```typescript
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

const PROGRAM_ID = new PublicKey("4a48fH7tECz8ZPKCixUqGrvc1JqNk6FaivPxF2W4krpt");

// FeePool PDA
const [feePoolPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("fee_pool")],
  PROGRAM_ID
);

// Game PDA
const gameId = new BN(12345);
const [gamePda] = PublicKey.findProgramAddressSync(
  [Buffer.from("game"), gameId.toArrayLike(Buffer, "le", 8)],
  PROGRAM_ID
);

// Vault PDA
const [vaultPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), gamePda.toBuffer(), playerWallet.toBuffer()],
  PROGRAM_ID
);
```

---

## Remaining Accounts Pattern

Some instructions (`start_game`, `settle`, `cancel`, `settle_coinflip`) use **remaining accounts** — extra accounts passed dynamically because the number of players varies.

### `start_game` remaining accounts
Pass one vault PDA per player, in the order of `game.players[]`:
```
[vault_player_0, vault_player_1, vault_player_2, ...]
```

### `settle` remaining accounts
Pass all vault PDAs in order, then the winner's wallet address as the last account:
```
[vault_player_0, vault_player_1, ..., winner_wallet]
```
All accounts must be marked as **writable**.

### `cancel` remaining accounts
Pass alternating vault PDA + player wallet pairs:
```
[vault_player_0, wallet_player_0, vault_player_1, wallet_player_1, ...]
```
All accounts must be marked as **writable**.

### `settle_coinflip` — no remaining accounts
`settle_coinflip` uses **named accounts** (not remaining_accounts). All accounts are passed automatically by the VRF oracle via `accounts_metas` set in `request_coinflip`. You don't need to pass anything manually.

---

## Constants

| Name | Value | Description |
|------|-------|-------------|
| `FEE_PER_DEPOSIT` | 5000 lamports | Fee skimmed from each vault at settlement |
| `TIMEOUT_DURATION` | 1800 seconds (30 min) | Time after which a game can be cancelled |
| `wager_amount` minimum | > 5000 lamports | Must be greater than the fee |

---

## Error Codes

| Error | When |
|-------|------|
| `Unauthorized` | Caller is not the app_host of the game |
| `InvalidWagerAmount` | wager_amount <= 5000 lamports |
| `GameNotOpen` | Trying to register_player or lock on a non-Open game |
| `GameNotLocked` | Trying to start a non-Locked game |
| `GameNotActive` | Trying to settle/coinflip a non-Active game |
| `GameSettled` | Trying to cancel a Settled or Cancelled game |
| `GameNotTimedOut` | Trying to cancel before 30 minutes |
| `PlayerAlreadyRegistered` | Player already in the game |
| `InvalidVault` | Vault PDA doesn't match expected derivation |
| `InsufficientWager` | Vault doesn't have enough SOL |
| `InvalidWinnerIndex` | winner_index out of bounds |
| `InvalidAccounts` | Wrong number of remaining accounts |
| `InvalidWinnerAccount` | Last remaining account doesn't match the winner |
| `InvalidPlayerAccount` | Wallet doesn't match the player |
| `NotEnoughPlayers` | Trying to lock with less than 2 players |
| `InvalidGameType` | Using settle on CoinFlip or request_coinflip on Normal |

---

## Integration Checklist for Flutter

### Setup (one-time)
- [ ] Store the app_host keypair securely on the device
- [x] ~~Call `init_fee_pool` once to create the fee pool~~ — Already done on devnet

### For each Normal game:
1. [ ] Generate a unique `game_id` (e.g. `DateTime.now().millisecondsSinceEpoch`)
2. [ ] Call `create_game(game_id, wager_amount, { Normal: {} })`
3. [ ] For each player: call `register_player(playerWalletPubkey)`
4. [ ] Show each player their vault PDA address — they send SOL there from Phantom
5. [ ] Poll each vault's balance until all players have deposited
6. [ ] Call `lock_game`
7. [ ] Call `start_game` with vault PDAs as remaining accounts
8. [ ] Play the game via BLE
9. [ ] When game ends: call `settle(winnerIndex)` with vaults + winner wallet as remaining accounts
10. [ ] If timeout (30 min): call `cancel` with vault+wallet pairs as remaining accounts

### For CoinFlip game:
1. [ ] Same steps 1-7 but with `{ CoinFlip: {} }` as game_type and exactly 2 players
2. [ ] Call `request_coinflip` — the VRF oracle will automatically call `settle_coinflip`
3. [ ] Poll `game.status` until it becomes `Settled`, then read `game` account to show result

### Auto-cancel (optional, uses MagicBlock Ephemeral Rollups):
1. [ ] After `start_game`, call `delegate_game(game_id)` to delegate Game PDA to the ER
2. [ ] Call `schedule_auto_cancel({ task_id: someUniqueId })` to schedule cancel after 30 min
3. [ ] If game settles normally before timeout, call `undelegate_game` to get the account back

### Showing vault address to players:
```dart
// Derive the vault PDA for the player
final vaultPda = await Ed25519HDPublicKey.findProgramAddress(
  seeds: [utf8.encode('vault'), gamePda.bytes, playerWallet.bytes],
  programId: programId,
);

// Show this address to the player:
// "Send {wager_amount / LAMPORTS_PER_SOL} SOL to {vaultPda.toBase58()}"
```

### Checking if a vault has been funded:
```dart
// Get vault account balance
final balance = await connection.getBalance(vaultPda);
final rent = await connection.getMinimumBalanceForRentExemption(9); // 8 + 1 byte
final isFunded = balance >= wagerAmount + rent;
```

---

## Devnet Resources

### MagicBlock Addresses (Devnet)

| Name | Address | Usage |
|------|---------|-------|
| **VRF Program** | `Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz` | The VRF on-chain program |
| **DEFAULT_QUEUE** | `Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh` | Oracle queue for `request_coinflip` — **USE THIS ONE** |
| **VRF_PROGRAM_IDENTITY** | `9irBy75QS2BN81FUgXuHcjqceJJRuc9oDkAe8TKVvvAw` | Signer that validates VRF callbacks |
| **ER Router** | `https://devnet-router.magicblock.app` | Ephemeral Rollups router for delegate/crank |

**IMPORTANT:** Do NOT use `GKE6d7iv8kCBrsxr78W3xVdjGLLLJnxsGiuzrsZCGEvb` — that's the test-only queue. The correct devnet oracle queue is `Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh`.

### Wager Program

| Name | Address |
|------|---------|
| **Program ID** | `4a48fH7tECz8ZPKCixUqGrvc1JqNk6FaivPxF2W4krpt` |
| **IDL Account** | `2PoZTjR8orb3SmYJLxoRrzbRRwUYDg6nASWCngZhu6Zv` |
