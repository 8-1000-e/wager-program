import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";

// ── Constants (must match programs/wager/src/constants.rs) ──────────────
export const FEE_PER_DEPOSIT = 5000; // lamports
export const TIMEOUT_DURATION = 1800; // seconds (30 min)
export const VAULT_ACCOUNT_SIZE = 8 + 1; // discriminator + bump (u8)

// ── PDA helpers ─────────────────────────────────────────────────────────

export function getFeePoolPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fee_pool")],
    programId
  );
}

export function getGamePda(
  programId: PublicKey,
  gameId: anchor.BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("game"), gameId.toArrayLike(Buffer, "le", 8)],
    programId
  );
}

export function getVaultPda(
  programId: PublicKey,
  gamePda: PublicKey,
  player: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), gamePda.toBuffer(), player.toBuffer()],
    programId
  );
}

// ── Utilities ───────────────────────────────────────────────────────────

export async function airdrop(
  provider: anchor.AnchorProvider,
  to: PublicKey,
  sol: number
) {
  const sig = await provider.connection.requestAirdrop(
    to,
    sol * LAMPORTS_PER_SOL
  );
  await provider.connection.confirmTransaction(sig);
}

export async function fundVault(
  provider: anchor.AnchorProvider,
  from: anchor.web3.Keypair,
  vaultPda: PublicKey,
  lamports: number
) {
  const tx = new anchor.web3.Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: vaultPda,
      lamports,
    })
  );
  await provider.sendAndConfirm(tx, [from]);
}

export async function getBalance(
  provider: anchor.AnchorProvider,
  address: PublicKey
): Promise<number> {
  return provider.connection.getBalance(address);
}

export async function getVaultRent(
  provider: anchor.AnchorProvider
): Promise<number> {
  return provider.connection.getMinimumBalanceForRentExemption(
    VAULT_ACCOUNT_SIZE
  );
}

// ── Game setup helpers ──────────────────────────────────────────────────

/**
 * Registers 2 players for a game. Returns player keypairs and vault PDAs.
 * Players are airdropped 1 SOL each.
 */
export async function registerTwoPlayers(
  program: any,
  provider: anchor.AnchorProvider,
  gamePda: PublicKey
): Promise<{
  players: [anchor.web3.Keypair, anchor.web3.Keypair];
  vaults: [PublicKey, PublicKey];
}> {
  const p1 = anchor.web3.Keypair.generate();
  const p2 = anchor.web3.Keypair.generate();

  await airdrop(provider, p1.publicKey, 1);
  await airdrop(provider, p2.publicKey, 1);

  const [v1] = getVaultPda(program.programId, gamePda, p1.publicKey);
  const [v2] = getVaultPda(program.programId, gamePda, p2.publicKey);

  for (const [player, vault] of [
    [p1, v1],
    [p2, v2],
  ] as [anchor.web3.Keypair, PublicKey][]) {
    await program.methods
      .registerPlayer(player.publicKey)
      .accounts({
        payer: provider.wallet.publicKey,
        vault,
        game: gamePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  return { players: [p1, p2], vaults: [v1, v2] };
}
