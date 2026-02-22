import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Wager } from "../../target/types/wager";
import { expect } from "chai";
import { Keypair, SystemProgram, PublicKey } from "@solana/web3.js";
import {
  getFeePoolPda,
  getGamePda,
  getVaultPda,
  fundVault,
  FEE_PER_DEPOSIT,
} from "../helpers";

const ORACLE_QUEUE = new PublicKey(
  "Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh"
);

describe("Devnet — CoinFlip Error Cases", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Wager as Program<Wager>;

  const [feePoolPda] = getFeePoolPda(program.programId);
  const base = Date.now() % 1_000_000_000;

  // ── request_coinflip on Normal game → InvalidGameType ─────────────
  describe("request_coinflip rejects Normal games", () => {
    const gameId = new anchor.BN(base + 1);
    const wagerAmount = 100_000;
    const [gamePda] = getGamePda(program.programId, gameId);

    const player1 = Keypair.generate();
    const player2 = Keypair.generate();

    before(async () => {
      // Fund players
      const tx = new anchor.web3.Transaction().add(
        SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey,
          toPubkey: player1.publicKey,
          lamports: 0.05 * anchor.web3.LAMPORTS_PER_SOL,
        }),
        SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey,
          toPubkey: player2.publicKey,
          lamports: 0.05 * anchor.web3.LAMPORTS_PER_SOL,
        })
      );
      await provider.sendAndConfirm(tx);

      const [v1] = getVaultPda(
        program.programId,
        gamePda,
        player1.publicKey
      );
      const [v2] = getVaultPda(
        program.programId,
        gamePda,
        player2.publicKey
      );

      // Create Normal game → register → lock → fund → start
      await program.methods
        .createGame(gameId, new anchor.BN(wagerAmount), { normal: {} })
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      for (const [player, vault] of [
        [player1, v1],
        [player2, v2],
      ] as [Keypair, PublicKey][]) {
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

      await program.methods
        .lockGame()
        .accounts({ payer: provider.wallet.publicKey, game: gamePda })
        .rpc();

      await fundVault(provider, player1, v1, wagerAmount);
      await fundVault(provider, player2, v2, wagerAmount);

      await program.methods
        .startGame()
        .accounts({ payer: provider.wallet.publicKey, game: gamePda })
        .remainingAccounts([
          { pubkey: v1, isSigner: false, isWritable: true },
          { pubkey: v2, isSigner: false, isWritable: true },
        ])
        .rpc();
    });

    it("request_coinflip fails with InvalidGameType on Normal game", async () => {
      try {
        await program.methods
          .requestCoinflip()
          .accounts({
            payer: provider.wallet.publicKey,
            game: gamePda,
            oracleQueue: ORACLE_QUEUE,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        const errStr = JSON.stringify(err);
        expect(errStr).to.include("InvalidGameType");
        console.log(`    Correctly rejected: InvalidGameType`);
      }
    });
  });

  // ── request_coinflip on non-Active CoinFlip game → GameNotActive ──
  describe("request_coinflip rejects non-Active games", () => {
    const gameId = new anchor.BN(base + 2);
    const [gamePda] = getGamePda(program.programId, gameId);

    before(async () => {
      // Create CoinFlip game but don't start it (leave it Open)
      await program.methods
        .createGame(gameId, new anchor.BN(100_000), { coinFlip: {} })
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("request_coinflip fails with GameNotActive on Open game", async () => {
      try {
        await program.methods
          .requestCoinflip()
          .accounts({
            payer: provider.wallet.publicKey,
            game: gamePda,
            oracleQueue: ORACLE_QUEUE,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        const errStr = JSON.stringify(err);
        expect(errStr).to.include("GameNotActive");
        console.log(`    Correctly rejected: GameNotActive`);
      }
    });
  });
});
