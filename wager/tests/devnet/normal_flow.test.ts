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
  getBalance,
  getVaultRent,
  FEE_PER_DEPOSIT,
} from "../helpers";

describe("Devnet — Normal Game Flow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Wager as Program<Wager>;

  const [feePoolPda] = getFeePoolPda(program.programId);

  const gameId = new anchor.BN(Date.now() % 1_000_000_000);
  const wagerAmount = 100_000;
  const [gamePda] = getGamePda(program.programId, gameId);

  const player1 = Keypair.generate();
  const player2 = Keypair.generate();

  let vault1Pda: PublicKey;
  let vault2Pda: PublicKey;
  let vaultRent: number;

  before(async () => {
    [vault1Pda] = getVaultPda(program.programId, gamePda, player1.publicKey);
    [vault2Pda] = getVaultPda(program.programId, gamePda, player2.publicKey);
    vaultRent = await getVaultRent(provider);

    console.log(`    Game ID: ${gameId.toString()}`);
    console.log(`    Game PDA: ${gamePda.toBase58()}`);

    // Fund players from wallet
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
  });

  it("creates a Normal game", async () => {
    await program.methods
      .createGame(gameId, new anchor.BN(wagerAmount), { normal: {} })
      .accounts({
        payer: provider.wallet.publicKey,
        game: gamePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const game = await program.account.game.fetch(gamePda);
    expect(game.gameId.toNumber()).to.equal(gameId.toNumber());
    expect(JSON.stringify(game.gameType)).to.include("normal");
    expect(JSON.stringify(game.status)).to.include("open");
  });

  it("registers 2 players", async () => {
    await program.methods
      .registerPlayer(player1.publicKey)
      .accounts({
        payer: provider.wallet.publicKey,
        vault: vault1Pda,
        game: gamePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

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
  });

  it("locks the game", async () => {
    await program.methods
      .lockGame()
      .accounts({ payer: provider.wallet.publicKey, game: gamePda })
      .rpc();

    const game = await program.account.game.fetch(gamePda);
    expect(JSON.stringify(game.status)).to.include("locked");
  });

  it("funds vaults and starts the game", async () => {
    await fundVault(provider, player1, vault1Pda, wagerAmount);
    await fundVault(provider, player2, vault2Pda, wagerAmount);

    await program.methods
      .startGame()
      .accounts({ payer: provider.wallet.publicKey, game: gamePda })
      .remainingAccounts([
        { pubkey: vault1Pda, isSigner: false, isWritable: true },
        { pubkey: vault2Pda, isSigner: false, isWritable: true },
      ])
      .rpc();

    const game = await program.account.game.fetch(gamePda);
    expect(JSON.stringify(game.status)).to.include("active");
  });

  it("settles the game — player 1 wins", async () => {
    const winnerBefore = await getBalance(provider, player1.publicKey);
    const feePoolBefore = await getBalance(provider, feePoolPda);

    await program.methods
      .settle(0)
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

    const game = await program.account.game.fetch(gamePda);
    expect(JSON.stringify(game.status)).to.include("settled");

    // Vaults drained
    expect(await getBalance(provider, vault1Pda)).to.equal(0);
    expect(await getBalance(provider, vault2Pda)).to.equal(0);

    // Winner received vault_balance - FEE_PER_DEPOSIT for each vault
    const vaultBalance = wagerAmount + vaultRent;
    const expectedWinnings = 2 * (vaultBalance - FEE_PER_DEPOSIT);
    const winnerAfter = await getBalance(provider, player1.publicKey);
    expect(winnerAfter - winnerBefore).to.equal(expectedWinnings);

    // Fee pool received 2 * FEE_PER_DEPOSIT
    const feePoolAfter = await getBalance(provider, feePoolPda);
    expect(feePoolAfter - feePoolBefore).to.equal(2 * FEE_PER_DEPOSIT);

    console.log(`    Settled! Winner received ${expectedWinnings} lamports`);
    console.log(`    Fee pool received ${2 * FEE_PER_DEPOSIT} lamports`);
  });
});
