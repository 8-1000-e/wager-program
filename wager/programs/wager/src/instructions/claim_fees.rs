use anchor_lang::prelude::*;
use crate::constants::FEE_POOL_PDA;
use crate::errors::WagerError;
use crate::state::FeePool;

pub fn _claim_fees(ctx: Context<ClaimFees>) -> Result<()>
{
    let rent = Rent::get()?.minimum_balance(ctx.accounts.fee_pool.to_account_info().data_len());
    let amount = ctx.accounts.fee_pool.to_account_info().lamports() - rent;

    **ctx.accounts.fee_pool.to_account_info().try_borrow_mut_lamports()? -= amount;
    **ctx.accounts.payer.to_account_info().try_borrow_mut_lamports()? += amount;
    Ok(())
}

#[derive(Accounts)]
pub struct ClaimFees<'info>
{
    #[account(
        mut,
    )]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [FEE_POOL_PDA],
        bump = fee_pool.bump,
        constraint = payer.key() == fee_pool.authority @ WagerError::Unauthorized,
    )]
    pub fee_pool: Account<'info, FeePool>,
}
