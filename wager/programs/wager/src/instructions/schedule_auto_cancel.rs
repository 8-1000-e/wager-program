use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;
use ephemeral_rollups_sdk::consts::MAGIC_PROGRAM_ID;
use magicblock_magic_program_api::{args::ScheduleTaskArgs, instruction::MagicBlockInstruction};
use crate::constants::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ScheduleCancelArgs {
    pub task_id: i64,
}

pub fn _schedule_auto_cancel(ctx: Context<ScheduleAutoCancel>, args: ScheduleCancelArgs) -> Result<()> {
    // 1. Concstruire l'instruction Cancel
    let cancel_ix = Instruction {
        program_id: crate::ID,
        accounts: vec![AccountMeta::new(ctx.accounts.game.key(), false)],
        data: anchor_lang::InstructionData::data(&crate::instruction::Cancel {})
    };

    let ix_data = bincode::serialize(&MagicBlockInstruction::ScheduleTask(ScheduleTaskArgs
        {
        task_id: args.task_id,                                             
        execution_interval_millis: (TIMEOUT_DURATION * 1000) as i64,
        iterations: 1,
        instructions: vec![cancel_ix],
        }))
        .map_err(|_| ProgramError::InvalidArgument)?;

    let schedule_ix = Instruction::new_with_bytes(
        MAGIC_PROGRAM_ID,
        &ix_data,
        vec![
            AccountMeta::new(ctx.accounts.payer.key(), true),
            AccountMeta::new(ctx.accounts.game.key(), false),
        ],
    );

    invoke_signed(&schedule_ix, &[
        ctx.accounts.payer.to_account_info(),
        ctx.accounts.game.to_account_info(),
    ], &[])?;

    Ok(())
}

#[derive(Accounts)]
pub struct ScheduleAutoCancel<'info> {
    /// CHECK: MagicBlock program
    pub magic_program: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Game PDA — AccountInfo pour éviter re-serialisation après CPI
    #[account(mut)]
    pub game: AccountInfo<'info>,

    /// CHECK: used for CPI
    pub program: AccountInfo<'info>,
}
