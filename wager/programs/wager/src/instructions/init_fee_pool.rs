use anchor_lang::prelude::*;
use crate::constants::FEE_POOL_PDA;
use crate::state::fee_pool::FeePool;

pub fn _init_fee_pool(ctx: Context<InitFeePool>) -> Result<()> 
{
    ctx.accounts.fee_pool.authority = ctx.accounts.payer.key();
    ctx.accounts.fee_pool.bump = ctx.bumps.fee_pool;
    Ok(())
}

#[derive(Accounts)]
pub struct InitFeePool<'info>
{
    #[account(
        mut
    )]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + FeePool::INIT_SPACE,
        seeds = [FEE_POOL_PDA],
        bump
    )]
    pub fee_pool: Account<'info, FeePool>,

    pub system_program: Program<'info, System>,
}
