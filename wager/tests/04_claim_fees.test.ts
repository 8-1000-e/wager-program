import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Wager } from "../target/types/wager";
import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import { getFeePoolPda, getBalance, airdrop } from "./helpers";

describe("04 - Claim Fees", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Wager as Program<Wager>;

  const [feePoolPda] = getFeePoolPda(program.programId);

  it("claims accumulated fees", async () => {
    // Fee pool should have fees from the settle in test 02
    const feePoolBalance = await getBalance(provider, feePoolPda);
    const feePoolRent =
      await provider.connection.getMinimumBalanceForRentExemption(
        (await provider.connection.getAccountInfo(feePoolPda))!.data.length
      );

    const claimable = feePoolBalance - feePoolRent;

    // Skip if nothing to claim (shouldn't happen after test 02 settle)
    if (claimable <= 0) {
      console.log("  ⚠ No fees to claim — skipping");
      return;
    }

    const authorityBefore = await getBalance(
      provider,
      provider.wallet.publicKey
    );

    await program.methods
      .claimFees()
      .accounts({
        payer: provider.wallet.publicKey,
        feePool: feePoolPda,
      })
      .rpc();

    const authorityAfter = await getBalance(
      provider,
      provider.wallet.publicKey
    );
    const feePoolAfter = await getBalance(provider, feePoolPda);

    // Fee pool should be back to just rent
    expect(feePoolAfter).to.equal(feePoolRent);

    // Authority should have gained claimable minus tx fee
    // (tx fee is ~5000 lamports, so we check with tolerance)
    const gained = authorityAfter - authorityBefore;
    expect(gained).to.be.greaterThan(claimable - 10_000); // account for tx fee
    expect(gained).to.be.lessThanOrEqual(claimable);
  });

  it("fails when unauthorized wallet tries to claim", async () => {
    const impostor = Keypair.generate();
    await airdrop(provider, impostor.publicKey, 1);

    try {
      await program.methods
        .claimFees()
        .accounts({
          payer: impostor.publicKey,
          feePool: feePoolPda,
        })
        .signers([impostor])
        .rpc();
      expect.fail("should have thrown");
    } catch (err) {
      const errStr = JSON.stringify(err);
      expect(errStr).to.include("Unauthorized");
    }
  });
});
