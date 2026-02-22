use anchor_lang::prelude::*;
use crate::constants::{GAME_PDA, VAULT_PDA, FEE_POOL_PDA, TIMEOUT_DURATION};
use crate::errors::WagerError;
use crate::state::{Game, GameStatus, Vault, FeePool};

pub fn _cancel(ctx: Context<Cancel>) -> Result<()>
{
    require!(ctx.accounts.game.status != GameStatus::Settled && ctx.accounts.game.status != GameStatus::Cancelled, WagerError::GameSettled);
    let now = Clock::get()?.unix_timestamp;
    require!(now > ctx.accounts.game.created_at + TIMEOUT_DURATION as i64, WagerError::GameNotTimedOut);

    for i in 0..ctx.accounts.game.players.len()
    {
        let vault = &ctx.remaining_accounts[i * 2];
        let wallet = &ctx.remaining_accounts[i * 2 + 1];
        let (expected_pda, _) = Pubkey::find_program_address(
            &[VAULT_PDA, ctx.accounts.game.key().as_ref(), ctx.accounts.game.players[i].as_ref()],
            ctx.program_id
        );
        require!(vault.key() == expected_pda, WagerError::InvalidVault);
        require!(wallet.key() == ctx.accounts.game.players[i], WagerError::InvalidPlayerAccount);

        let vault_balance = vault.lamports();
        **vault.try_borrow_mut_lamports()? = 0;
        **wallet.try_borrow_mut_lamports()? += vault_balance;

        vault.assign(&System::id());
        vault.resize(0)?;
    }

    ctx.accounts.game.status = GameStatus::Cancelled;

    Ok(())
}

#[derive(Accounts)]
pub struct Cancel<'info>
{
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        constraint = game.app_host == payer.key() @ WagerError::Unauthorized,
        seeds = [GAME_PDA, &game.game_id.to_le_bytes()],
        bump = game.bump,
    )]
    pub game: Account<'info, Game>,

    #[account(
        mut,
        seeds = [FEE_POOL_PDA],
        bump = fee_pool.bump,
    )]
    pub fee_pool: Account<'info, FeePool>,
}
