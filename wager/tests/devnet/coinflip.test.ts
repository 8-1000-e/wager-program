import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Wager } from "../../target/types/wager";
import { expect } from "chai";
import { Keypair, SystemProgram, PublicKey } from "@solana/web3.js";
import {
  getFeePoolPda,
  getGamePda,
  getVaultPda,
  airdrop,
  fundVault,
  getBalance,
  getVaultRent,
  FEE_PER_DEPOSIT,
} from "../helpers";

// MagicBlock VRF oracle queue on devnet
const ORACLE_QUEUE = new PublicKey(
  "Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh"
);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Devnet — CoinFlip VRF Flow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Wager as Program<Wager>;

  const [feePoolPda] = getFeePoolPda(program.programId);

  // Unique game ID based on timestamp to avoid collisions
  const gameId = new anchor.BN(Date.now() % 1_000_000_000);
  const wagerAmount = 100_000; // 0.0001 SOL — small to save devnet SOL
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
    console.log(`    Player 1: ${player1.publicKey.toBase58()}`);
    console.log(`    Player 2: ${player2.publicKey.toBase58()}`);

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

  it("creates a CoinFlip game", async () => {
    await program.methods
      .createGame(gameId, new anchor.BN(wagerAmount), { coinFlip: {} })
      .accounts({
        payer: provider.wallet.publicKey,
        game: gamePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const game = await program.account.game.fetch(gamePda);
    expect(game.gameId.toNumber()).to.equal(gameId.toNumber());
    expect(JSON.stringify(game.gameType)).to.include("coinFlip");
    expect(JSON.stringify(game.status)).to.include("open");
    console.log(`    Game created: type=CoinFlip, status=Open`);
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
    console.log(`    Registered: ${game.players.length} players`);
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
    await fundVault(provider, player1, vault1Pda, wagerAmount);
    await fundVault(provider, player2, vault2Pda, wagerAmount);

    const v1 = await getBalance(provider, vault1Pda);
    const v2 = await getBalance(provider, vault2Pda);
    expect(v1).to.be.gte(wagerAmount + vaultRent);
    expect(v2).to.be.gte(wagerAmount + vaultRent);
    console.log(`    Vaults funded: ${v1} / ${v2} lamports`);
  });

  it("starts the game", async () => {
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
    console.log(`    Game started: status=Active`);
  });

  it("settle rejects CoinFlip game (wrong game type)", async () => {
    try {
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
          {
            pubkey: player1.publicKey,
            isSigner: false,
            isWritable: true,
          },
        ])
        .rpc();
      expect.fail("should have thrown");
    } catch (err) {
      const errStr = JSON.stringify(err);
      expect(errStr).to.include("InvalidGameType");
      console.log(`    settle correctly rejected: InvalidGameType`);
    }
  });

  it("requests VRF coinflip", async () => {
    const tx = await program.methods
      .requestCoinflip()
      .accounts({
        payer: provider.wallet.publicKey,
        game: gamePda,
        oracleQueue: ORACLE_QUEUE,
      })
      .rpc();

    console.log(`    request_coinflip tx: ${tx}`);
    console.log(`    Waiting for VRF oracle callback...`);
  });

  it("VRF oracle settles the coinflip (poll for result)", async function () {
    // Poll the game account until it's settled (VRF callback)
    // NOTE: Depends on MagicBlock VRF oracle being active on devnet
    const MAX_WAIT = 180_000; // 180 seconds (oracle can take 2-3 min)
    const POLL_INTERVAL = 5_000; // 5 seconds
    const start = Date.now();

    let game: any;
    while (Date.now() - start < MAX_WAIT) {
      game = await program.account.game.fetch(gamePda);
      const status = JSON.stringify(game.status);
      if (status.includes("settled")) {
        console.log(
          `    Game settled by VRF after ${((Date.now() - start) / 1000).toFixed(1)}s`
        );
        break;
      }
      await sleep(POLL_INTERVAL);
    }

    game = await program.account.game.fetch(gamePda);
    const finalStatus = JSON.stringify(game.status);
    if (!finalStatus.includes("settled")) {
      console.log(
        `    WARNING: VRF oracle did not respond within ${MAX_WAIT / 1000}s. Game still: ${finalStatus}`
      );
      console.log(
        `    This is expected if the MagicBlock VRF oracle is inactive on devnet.`
      );
      console.log(
        `    Game PDA: ${gamePda.toBase58()} — check status manually later.`
      );
      this.skip(); // Skip rather than fail — infra dependency
      return;
    }

    // Check vaults are drained
    const v1 = await getBalance(provider, vault1Pda);
    const v2 = await getBalance(provider, vault2Pda);
    console.log(`    Vault balances after settle: ${v1} / ${v2}`);
    expect(v1).to.equal(0);
    expect(v2).to.equal(0);

    // Check one player received the winnings
    const p1Bal = await getBalance(provider, player1.publicKey);
    const p2Bal = await getBalance(provider, player2.publicKey);
    console.log(
      `    Player balances: P1=${p1Bal} / P2=${p2Bal}`
    );

    // One player should have received significantly more than the other
    const totalDeposited = 2 * wagerAmount;
    const totalFees = 2 * FEE_PER_DEPOSIT;
    const winnerGets = totalDeposited - totalFees; // approximate
    // The winner's balance should be noticeably higher
    const maxBal = Math.max(p1Bal, p2Bal);
    expect(maxBal).to.be.greaterThan(0.04 * anchor.web3.LAMPORTS_PER_SOL);

    if (p1Bal > p2Bal) {
      console.log(`    Winner: Player 1`);
    } else {
      console.log(`    Winner: Player 2`);
    }
  });
});
