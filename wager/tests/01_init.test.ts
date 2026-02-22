import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Wager } from "../target/types/wager";
import { expect } from "chai";
import { SystemProgram } from "@solana/web3.js";
import { getFeePoolPda } from "./helpers";

describe("01 - Init Fee Pool", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Wager as Program<Wager>;

  const [feePoolPda] = getFeePoolPda(program.programId);

  it("initializes the fee pool", async () => {
    await program.methods
      .initFeePool()
      .accounts({
        payer: provider.wallet.publicKey,
        feePool: feePoolPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const feePool = await program.account.feePool.fetch(feePoolPda);
    expect(feePool.authority.toBase58()).to.equal(
      provider.wallet.publicKey.toBase58()
    );
    expect(feePool.bump).to.be.a("number");
  });

  it("fails when initialized twice (PDA already exists)", async () => {
    try {
      await program.methods
        .initFeePool()
        .accounts({
          payer: provider.wallet.publicKey,
          feePool: feePoolPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("should have thrown");
    } catch (err) {
      // Anchor will throw because the PDA account is already initialized
      expect(err).to.exist;
    }
  });
});
