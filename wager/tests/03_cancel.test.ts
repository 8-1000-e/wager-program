import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Wager } from "../target/types/wager";
import { expect } from "chai";
import { Keypair, SystemProgram } from "@solana/web3.js";
import {
  getFeePoolPda,
  getGamePda,
  getVaultPda,
  airdrop,
  fundVault,
  getBalance,
  getVaultRent,
  registerTwoPlayers,
} from "./helpers";

describe("03 - Cancel Flow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Wager as Program<Wager>;

  const [feePoolPda] = getFeePoolPda(program.programId);

  // ── Cancel error: game not timed out ────────────────────────────────
  describe("cancel before timeout", () => {
    const gameId = new anchor.BN(100);
    const wagerAmount = 500_000;
    const [gamePda] = getGamePda(program.programId, gameId);

    let players: [Keypair, Keypair];
    let vaults: [anchor.web3.PublicKey, anchor.web3.PublicKey];

    before(async () => {
      await program.methods
        .createGame(gameId, new anchor.BN(wagerAmount), { normal: {} })
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      ({ players, vaults } = await registerTwoPlayers(
        program,
        provider,
        gamePda
      ));

      await program.methods
        .lockGame()
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
        })
        .rpc();
    });

    it("fails to cancel — timeout not reached", async () => {
      try {
        await program.methods
          .cancel()
          .accounts({
            payer: provider.wallet.publicKey,
            game: gamePda,
            feePool: feePoolPda,
          })
          .remainingAccounts([
            { pubkey: vaults[0], isSigner: false, isWritable: true },
            {
              pubkey: players[0].publicKey,
              isSigner: false,
              isWritable: true,
            },
            { pubkey: vaults[1], isSigner: false, isWritable: true },
            {
              pubkey: players[1].publicKey,
              isSigner: false,
              isWritable: true,
            },
          ])
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        const errStr = JSON.stringify(err);
        expect(errStr).to.include("GameNotTimedOut");
      }
    });
  });

  // ── Cancel error: already settled ───────────────────────────────────
  describe("cancel after settlement", () => {
    const gameId = new anchor.BN(101);
    const wagerAmount = 500_000;
    const [gamePda] = getGamePda(program.programId, gameId);

    let players: [Keypair, Keypair];
    let vaults: [anchor.web3.PublicKey, anchor.web3.PublicKey];

    before(async () => {
      await program.methods
        .createGame(gameId, new anchor.BN(wagerAmount), { normal: {} })
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      ({ players, vaults } = await registerTwoPlayers(
        program,
        provider,
        gamePda
      ));

      await program.methods
        .lockGame()
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
        })
        .rpc();

      // Fund both vaults
      await fundVault(provider, players[0], vaults[0], wagerAmount);
      await fundVault(provider, players[1], vaults[1], wagerAmount);

      await program.methods
        .startGame()
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
        })
        .remainingAccounts([
          { pubkey: vaults[0], isSigner: false, isWritable: true },
          { pubkey: vaults[1], isSigner: false, isWritable: true },
        ])
        .rpc();

      // Settle — player 0 wins
      await program.methods
        .settle(0)
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
          feePool: feePoolPda,
        })
        .remainingAccounts([
          { pubkey: vaults[0], isSigner: false, isWritable: true },
          { pubkey: vaults[1], isSigner: false, isWritable: true },
          {
            pubkey: players[0].publicKey,
            isSigner: false,
            isWritable: true,
          },
        ])
        .rpc();
    });

    it("fails to cancel — game already settled", async () => {
      try {
        await program.methods
          .cancel()
          .accounts({
            payer: provider.wallet.publicKey,
            game: gamePda,
            feePool: feePoolPda,
          })
          .remainingAccounts([
            { pubkey: vaults[0], isSigner: false, isWritable: true },
            {
              pubkey: players[0].publicKey,
              isSigner: false,
              isWritable: true,
            },
            { pubkey: vaults[1], isSigner: false, isWritable: true },
            {
              pubkey: players[1].publicKey,
              isSigner: false,
              isWritable: true,
            },
          ])
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        const errStr = JSON.stringify(err);
        expect(errStr).to.include("GameSettled");
      }
    });
  });

  // ── Cancel happy path ───────────────────────────────────────────────
  // NOTE: Requires time travel (30 min). Use anchor-bankrun or LiteSVM.
});
