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
  getVaultRent,
  registerTwoPlayers,
  FEE_PER_DEPOSIT,
} from "./helpers";

describe("05 - Error Cases", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Wager as Program<Wager>;

  const [feePoolPda] = getFeePoolPda(program.programId);
  const impostor = Keypair.generate();

  before(async () => {
    await airdrop(provider, impostor.publicKey, 2);
  });

  // ── create_game errors ────────────────────────────────────────────

  describe("create_game", () => {
    it("fails with wager_amount <= FEE_PER_DEPOSIT (5000)", async () => {
      const gameId = new anchor.BN(200);
      const [gamePda] = getGamePda(program.programId, gameId);

      try {
        await program.methods
          .createGame(gameId, new anchor.BN(FEE_PER_DEPOSIT), { normal: {} })
          .accounts({
            payer: provider.wallet.publicKey,
            game: gamePda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        const errStr = JSON.stringify(err);
        expect(errStr).to.include("InvalidWagerAmount");
      }
    });

    it("fails with wager_amount = 0", async () => {
      const gameId = new anchor.BN(201);
      const [gamePda] = getGamePda(program.programId, gameId);

      try {
        await program.methods
          .createGame(gameId, new anchor.BN(0), { normal: {} })
          .accounts({
            payer: provider.wallet.publicKey,
            game: gamePda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        const errStr = JSON.stringify(err);
        expect(errStr).to.include("InvalidWagerAmount");
      }
    });

    it("fails with duplicate game_id", async () => {
      const gameId = new anchor.BN(202);
      const [gamePda] = getGamePda(program.programId, gameId);

      await program.methods
        .createGame(gameId, new anchor.BN(100_000), { normal: {} })
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      try {
        await program.methods
          .createGame(gameId, new anchor.BN(100_000), { normal: {} })
          .accounts({
            payer: provider.wallet.publicKey,
            game: gamePda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.exist;
      }
    });
  });

  // ── register_player errors ────────────────────────────────────────

  describe("register_player", () => {
    const gameId = new anchor.BN(210);
    const wagerAmount = 100_000;
    const [gamePda] = getGamePda(program.programId, gameId);
    const player1 = Keypair.generate();

    before(async () => {
      await program.methods
        .createGame(gameId, new anchor.BN(wagerAmount), { normal: {} })
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("fails when non-app_host tries to register", async () => {
      const [vaultPda] = getVaultPda(
        program.programId,
        gamePda,
        player1.publicKey
      );

      try {
        await program.methods
          .registerPlayer(player1.publicKey)
          .accounts({
            payer: impostor.publicKey,
            vault: vaultPda,
            game: gamePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([impostor])
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        const errStr = JSON.stringify(err);
        expect(errStr).to.include("Unauthorized");
      }
    });

    it("fails when registering duplicate player", async () => {
      const [vaultPda] = getVaultPda(
        program.programId,
        gamePda,
        player1.publicKey
      );

      // First registration succeeds
      await program.methods
        .registerPlayer(player1.publicKey)
        .accounts({
          payer: provider.wallet.publicKey,
          vault: vaultPda,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Second registration fails (duplicate player)
      try {
        await program.methods
          .registerPlayer(player1.publicKey)
          .accounts({
            payer: provider.wallet.publicKey,
            vault: vaultPda,
            game: gamePda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.exist;
      }
    });

    it("fails when game is not open (locked)", async () => {
      // Register a second player so we can lock (need >= 2)
      const player2 = Keypair.generate();
      const [vault2Pda] = getVaultPda(
        program.programId,
        gamePda,
        player2.publicKey
      );

      await program.methods
        .registerPlayer(player2.publicKey)
        .accounts({
          payer: provider.wallet.publicKey,
          vault: vault2Pda,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Now lock the game (has 2 players)
      await program.methods
        .lockGame()
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
        })
        .rpc();

      // Try to register a 3rd player after lock
      const player3 = Keypair.generate();
      const [vault3Pda] = getVaultPda(
        program.programId,
        gamePda,
        player3.publicKey
      );

      try {
        await program.methods
          .registerPlayer(player3.publicKey)
          .accounts({
            payer: provider.wallet.publicKey,
            vault: vault3Pda,
            game: gamePda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        const errStr = JSON.stringify(err);
        expect(errStr).to.include("GameNotOpen");
      }
    });
  });

  // ── lock_game errors ──────────────────────────────────────────────

  describe("lock_game", () => {
    it("fails with not enough players (< 2)", async () => {
      const gameId = new anchor.BN(219);
      const [gamePda] = getGamePda(program.programId, gameId);

      await program.methods
        .createGame(gameId, new anchor.BN(100_000), { normal: {} })
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Register only 1 player
      const player = Keypair.generate();
      const [vaultPda] = getVaultPda(
        program.programId,
        gamePda,
        player.publicKey
      );

      await program.methods
        .registerPlayer(player.publicKey)
        .accounts({
          payer: provider.wallet.publicKey,
          vault: vaultPda,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      try {
        await program.methods
          .lockGame()
          .accounts({
            payer: provider.wallet.publicKey,
            game: gamePda,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        const errStr = JSON.stringify(err);
        expect(errStr).to.include("NotEnoughPlayers");
      }
    });

    it("fails when non-app_host tries to lock", async () => {
      const gameId = new anchor.BN(220);
      const [gamePda] = getGamePda(program.programId, gameId);

      await program.methods
        .createGame(gameId, new anchor.BN(100_000), { normal: {} })
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Unauthorized check happens before NotEnoughPlayers (constraint vs require)
      try {
        await program.methods
          .lockGame()
          .accounts({
            payer: impostor.publicKey,
            game: gamePda,
          })
          .signers([impostor])
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        const errStr = JSON.stringify(err);
        expect(errStr).to.include("Unauthorized");
      }
    });

    it("fails when game is already locked", async () => {
      const gameId = new anchor.BN(221);
      const [gamePda] = getGamePda(program.programId, gameId);

      await program.methods
        .createGame(gameId, new anchor.BN(100_000), { normal: {} })
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Register 2 players so lock succeeds
      await registerTwoPlayers(program, provider, gamePda);

      await program.methods
        .lockGame()
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
        })
        .rpc();

      try {
        await program.methods
          .lockGame()
          .accounts({
            payer: provider.wallet.publicKey,
            game: gamePda,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        const errStr = JSON.stringify(err);
        expect(errStr).to.include("GameNotOpen");
      }
    });
  });

  // ── start_game errors ─────────────────────────────────────────────

  describe("start_game", () => {
    it("fails when game is not locked (still open)", async () => {
      const gameId = new anchor.BN(230);
      const [gamePda] = getGamePda(program.programId, gameId);

      await program.methods
        .createGame(gameId, new anchor.BN(100_000), { normal: {} })
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      try {
        await program.methods
          .startGame()
          .accounts({
            payer: provider.wallet.publicKey,
            game: gamePda,
          })
          .remainingAccounts([])
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        const errStr = JSON.stringify(err);
        expect(errStr).to.include("GameNotLocked");
      }
    });

    it("fails when vault is not funded", async () => {
      const gameId = new anchor.BN(231);
      const wagerAmount = 100_000;
      const [gamePda] = getGamePda(program.programId, gameId);

      await program.methods
        .createGame(gameId, new anchor.BN(wagerAmount), { normal: {} })
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const { vaults } = await registerTwoPlayers(
        program,
        provider,
        gamePda
      );

      await program.methods
        .lockGame()
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
        })
        .rpc();

      // Don't fund the vaults — try to start
      try {
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
        expect.fail("should have thrown");
      } catch (err) {
        const errStr = JSON.stringify(err);
        expect(errStr).to.include("InsufficientWager");
      }
    });

    it("fails when non-app_host tries to start", async () => {
      const gameId = new anchor.BN(232);
      const [gamePda] = getGamePda(program.programId, gameId);

      await program.methods
        .createGame(gameId, new anchor.BN(100_000), { normal: {} })
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await registerTwoPlayers(program, provider, gamePda);

      await program.methods
        .lockGame()
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
        })
        .rpc();

      try {
        await program.methods
          .startGame()
          .accounts({
            payer: impostor.publicKey,
            game: gamePda,
          })
          .signers([impostor])
          .remainingAccounts([])
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        const errStr = JSON.stringify(err);
        expect(errStr).to.include("Unauthorized");
      }
    });
  });

  // ── settle errors ─────────────────────────────────────────────────

  describe("settle", () => {
    it("fails when game is not active", async () => {
      const gameId = new anchor.BN(240);
      const [gamePda] = getGamePda(program.programId, gameId);

      await program.methods
        .createGame(gameId, new anchor.BN(100_000), { normal: {} })
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      try {
        await program.methods
          .settle(0)
          .accounts({
            payer: provider.wallet.publicKey,
            game: gamePda,
            feePool: feePoolPda,
          })
          .remainingAccounts([
            {
              pubkey: provider.wallet.publicKey,
              isSigner: false,
              isWritable: true,
            },
          ])
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        const errStr = JSON.stringify(err);
        expect(errStr).to.include("GameNotActive");
      }
    });

    it("fails with invalid winner_index", async () => {
      const gameId = new anchor.BN(241);
      const wagerAmount = 100_000;
      const [gamePda] = getGamePda(program.programId, gameId);

      await program.methods
        .createGame(gameId, new anchor.BN(wagerAmount), { normal: {} })
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const { players, vaults } = await registerTwoPlayers(
        program,
        provider,
        gamePda
      );

      await program.methods
        .lockGame()
        .accounts({ payer: provider.wallet.publicKey, game: gamePda })
        .rpc();

      await fundVault(provider, players[0], vaults[0], wagerAmount);
      await fundVault(provider, players[1], vaults[1], wagerAmount);

      await program.methods
        .startGame()
        .accounts({ payer: provider.wallet.publicKey, game: gamePda })
        .remainingAccounts([
          { pubkey: vaults[0], isSigner: false, isWritable: true },
          { pubkey: vaults[1], isSigner: false, isWritable: true },
        ])
        .rpc();

      // winner_index = 5 but only 2 players
      try {
        await program.methods
          .settle(5)
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
        expect.fail("should have thrown");
      } catch (err) {
        const errStr = JSON.stringify(err);
        expect(errStr).to.include("InvalidWinnerIndex");
      }
    });

    it("fails with wrong number of remaining accounts", async () => {
      const gameId = new anchor.BN(242);
      const wagerAmount = 100_000;
      const [gamePda] = getGamePda(program.programId, gameId);

      await program.methods
        .createGame(gameId, new anchor.BN(wagerAmount), { normal: {} })
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const { players, vaults } = await registerTwoPlayers(
        program,
        provider,
        gamePda
      );

      await program.methods
        .lockGame()
        .accounts({ payer: provider.wallet.publicKey, game: gamePda })
        .rpc();

      await fundVault(provider, players[0], vaults[0], wagerAmount);
      await fundVault(provider, players[1], vaults[1], wagerAmount);

      await program.methods
        .startGame()
        .accounts({ payer: provider.wallet.publicKey, game: gamePda })
        .remainingAccounts([
          { pubkey: vaults[0], isSigner: false, isWritable: true },
          { pubkey: vaults[1], isSigner: false, isWritable: true },
        ])
        .rpc();

      // Pass 0 remaining accounts instead of 3 (2 vaults + 1 winner)
      try {
        await program.methods
          .settle(0)
          .accounts({
            payer: provider.wallet.publicKey,
            game: gamePda,
            feePool: feePoolPda,
          })
          .remainingAccounts([])
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        const errStr = JSON.stringify(err);
        expect(errStr).to.include("InvalidAccounts");
      }
    });

    it("fails when non-app_host tries to settle", async () => {
      const gameId = new anchor.BN(243);
      const wagerAmount = 100_000;
      const [gamePda] = getGamePda(program.programId, gameId);

      await program.methods
        .createGame(gameId, new anchor.BN(wagerAmount), { normal: {} })
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const { players, vaults } = await registerTwoPlayers(
        program,
        provider,
        gamePda
      );

      await program.methods
        .lockGame()
        .accounts({ payer: provider.wallet.publicKey, game: gamePda })
        .rpc();

      await fundVault(provider, players[0], vaults[0], wagerAmount);
      await fundVault(provider, players[1], vaults[1], wagerAmount);

      await program.methods
        .startGame()
        .accounts({ payer: provider.wallet.publicKey, game: gamePda })
        .remainingAccounts([
          { pubkey: vaults[0], isSigner: false, isWritable: true },
          { pubkey: vaults[1], isSigner: false, isWritable: true },
        ])
        .rpc();

      try {
        await program.methods
          .settle(0)
          .accounts({
            payer: impostor.publicKey,
            game: gamePda,
            feePool: feePoolPda,
          })
          .signers([impostor])
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
        expect.fail("should have thrown");
      } catch (err) {
        const errStr = JSON.stringify(err);
        expect(errStr).to.include("Unauthorized");
      }
    });
  });

  // ── game_type errors ─────────────────────────────────────────────

  describe("game_type", () => {
    it("fails to settle a CoinFlip game with settle (wrong game type)", async () => {
      const gameId = new anchor.BN(260);
      const wagerAmount = 100_000;
      const [gamePda] = getGamePda(program.programId, gameId);

      await program.methods
        .createGame(gameId, new anchor.BN(wagerAmount), { coinFlip: {} })
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const { players, vaults } = await registerTwoPlayers(
        program,
        provider,
        gamePda
      );

      await program.methods
        .lockGame()
        .accounts({ payer: provider.wallet.publicKey, game: gamePda })
        .rpc();

      await fundVault(provider, players[0], vaults[0], wagerAmount);
      await fundVault(provider, players[1], vaults[1], wagerAmount);

      await program.methods
        .startGame()
        .accounts({ payer: provider.wallet.publicKey, game: gamePda })
        .remainingAccounts([
          { pubkey: vaults[0], isSigner: false, isWritable: true },
          { pubkey: vaults[1], isSigner: false, isWritable: true },
        ])
        .rpc();

      try {
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
        expect.fail("should have thrown");
      } catch (err) {
        const errStr = JSON.stringify(err);
        expect(errStr).to.include("InvalidGameType");
      }
    });
  });

  // ── cancel errors ─────────────────────────────────────────────────

  describe("cancel", () => {
    it("fails when non-app_host tries to cancel", async () => {
      const gameId = new anchor.BN(250);
      const [gamePda] = getGamePda(program.programId, gameId);

      await program.methods
        .createGame(gameId, new anchor.BN(100_000), { normal: {} })
        .accounts({
          payer: provider.wallet.publicKey,
          game: gamePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      try {
        await program.methods
          .cancel()
          .accounts({
            payer: impostor.publicKey,
            game: gamePda,
            feePool: feePoolPda,
          })
          .signers([impostor])
          .remainingAccounts([])
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        const errStr = JSON.stringify(err);
        expect(errStr).to.include("Unauthorized");
      }
    });
  });
});
