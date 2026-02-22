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
  FEE_PER_DEPOSIT,
} from "./helpers";

describe("02 - Full Game Flow (Happy Path)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Wager as Program<Wager>;

  const gameId = new anchor.BN(1);
  const wagerAmount = 1_000_000; // lamports (0.001 SOL)

  const [feePoolPda] = getFeePoolPda(program.programId);
  const [gamePda] = getGamePda(program.programId, gameId);

  const player1 = Keypair.generate();
  const player2 = Keypair.generate();

  let vault1Pda: anchor.web3.PublicKey;
  let vault2Pda: anchor.web3.PublicKey;
  let vaultRent: number;

  before(async () => {
    [vault1Pda] = getVaultPda(program.programId, gamePda, player1.publicKey);
    [vault2Pda] = getVaultPda(program.programId, gamePda, player2.publicKey);

    // Airdrop SOL to players so they can fund their vaults
    await airdrop(provider, player1.publicKey, 1);
    await airdrop(provider, player2.publicKey, 1);

    vaultRent = await getVaultRent(provider);
  });

  it("creates a game", async () => {
    await program.methods
      .createGame(gameId, new anchor.BN(wagerAmount), { normal: {} })
      .accounts({
        payer: provider.wallet.publicKey,
        game: gamePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const game = await program.account.game.fetch(gamePda);
    expect(game.gameId.toNumber()).to.equal(1);
    expect(game.appHost.toBase58()).to.equal(
      provider.wallet.publicKey.toBase58()
    );
    expect(game.wagerAmount.toNumber()).to.equal(wagerAmount);
    expect(game.players).to.have.length(0);
    expect(JSON.stringify(game.status)).to.include("open");
    expect(game.bump).to.be.a("number");
  });

  it("registers player 1", async () => {
    await program.methods
      .registerPlayer(player1.publicKey)
      .accounts({
        payer: provider.wallet.publicKey,
        vault: vault1Pda,
        game: gamePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const game = await program.account.game.fetch(gamePda);
    expect(game.players).to.have.length(1);
    expect(game.players[0].toBase58()).to.equal(player1.publicKey.toBase58());
  });

  it("registers player 2", async () => {
    await program.methods
      .registerPlayer(player2.publicKey)
      .accounts({
        payer: provider.wallet.publicKey,
        vault: vault2Pda,
        game: gamePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const game = await program.account.game.fetch(gamePda);
    expect(game.players).to.have.length(2);
    expect(game.players[1].toBase58()).to.equal(player2.publicKey.toBase58());
  });

  it("locks the game", async () => {
    await program.methods
      .lockGame()
      .accounts({
        payer: provider.wallet.publicKey,
        game: gamePda,
      })
      .rpc();

    const game = await program.account.game.fetch(gamePda);
    expect(JSON.stringify(game.status)).to.include("locked");
  });

  it("players fund their vaults", async () => {
    // Each player deposits wager_amount into their vault
    await fundVault(provider, player1, vault1Pda, wagerAmount);
    await fundVault(provider, player2, vault2Pda, wagerAmount);

    // Verify vault balances: rent (from init) + wager_amount
    const vault1Balance = await getBalance(provider, vault1Pda);
    const vault2Balance = await getBalance(provider, vault2Pda);

    expect(vault1Balance).to.equal(vaultRent + wagerAmount);
    expect(vault2Balance).to.equal(vaultRent + wagerAmount);
  });

  it("starts the game (verifies vault deposits)", async () => {
    await program.methods
      .startGame()
      .accounts({
        payer: provider.wallet.publicKey,
        game: gamePda,
      })
      .remainingAccounts([
        { pubkey: vault1Pda, isSigner: false, isWritable: true },
        { pubkey: vault2Pda, isSigner: false, isWritable: true },
      ])
      .rpc();

    const game = await program.account.game.fetch(gamePda);
    expect(JSON.stringify(game.status)).to.include("active");
  });

  it("settles the game — player 1 wins", async () => {
    const winnerBalanceBefore = await getBalance(provider, player1.publicKey);
    const feePoolBalanceBefore = await getBalance(provider, feePoolPda);

    // remaining_accounts = [vault_0, vault_1, winner_wallet]
    await program.methods
      .settle(0) // winner_index = 0 (player1)
      .accounts({
        payer: provider.wallet.publicKey,
        game: gamePda,
        feePool: feePoolPda,
      })
      .remainingAccounts([
        { pubkey: vault1Pda, isSigner: false, isWritable: true },
        { pubkey: vault2Pda, isSigner: false, isWritable: true },
        { pubkey: player1.publicKey, isSigner: false, isWritable: true },
      ])
      .rpc();

    // Verify game status
    const game = await program.account.game.fetch(gamePda);
    expect(JSON.stringify(game.status)).to.include("settled");

    // Verify winner received: 2 * (vault_balance - FEE_PER_DEPOSIT)
    // vault_balance = wagerAmount + vaultRent (deposit + rent from init)
    const vaultBalance = wagerAmount + vaultRent;
    const expectedWinnings = 2 * (vaultBalance - FEE_PER_DEPOSIT);
    const winnerBalanceAfter = await getBalance(provider, player1.publicKey);
    expect(winnerBalanceAfter - winnerBalanceBefore).to.equal(expectedWinnings);

    // Verify fee pool received: 2 * FEE_PER_DEPOSIT
    const expectedFees = 2 * FEE_PER_DEPOSIT;
    const feePoolBalanceAfter = await getBalance(provider, feePoolPda);
    expect(feePoolBalanceAfter - feePoolBalanceBefore).to.equal(expectedFees);

    // Verify vaults are drained and closed
    const vault1Balance = await getBalance(provider, vault1Pda);
    const vault2Balance = await getBalance(provider, vault2Pda);
    expect(vault1Balance).to.equal(0);
    expect(vault2Balance).to.equal(0);
  });
});
