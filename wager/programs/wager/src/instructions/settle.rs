use anchor_lang::prelude::*;
use crate::constants::{GAME_PDA, VAULT_PDA, FEE_POOL_PDA, FEE_PER_DEPOSIT};
use crate::errors::WagerError;
use crate::state::{Game, GameStatus, GameType, Vault, FeePool};

pub fn _settle(ctx: Context<Settle>, winner_index: u8) -> Result<()>
{
    require!(ctx.accounts.game.game_type == GameType::Normal, WagerError::InvalidGameType);
    require!(ctx.accounts.game.status == GameStatus::Active, WagerError::GameNotActive);
    require!(ctx.accounts.game.players.len() > winner_index as usize, WagerError::InvalidWinnerIndex);
    require!(ctx.remaining_accounts.len() == ctx.accounts.game.players.len() + 1, WagerError::InvalidAccounts);
    require!(ctx.remaining_accounts.last().unwrap().key() == ctx.accounts.game.players[winner_index as usize], WagerError::InvalidWinnerAccount);

    let player_count = ctx.accounts.game.players.len();
    let winner_wallet = &ctx.remaining_accounts[player_count];
    for (i, vault_info) in ctx.remaining_accounts[..player_count].iter().enumerate()
    {
        let (expected_pda, _) = Pubkey::find_program_address(
            &[VAULT_PDA, ctx.accounts.game.key().as_ref(), ctx.accounts.game.players[i].as_ref()],
            ctx.program_id
        );
        require!(vault_info.key() == expected_pda, WagerError::InvalidVault);

        let vault_balance = vault_info.lamports();
        **vault_info.try_borrow_mut_lamports()? = 0;
        **winner_wallet.try_borrow_mut_lamports()? += vault_balance - FEE_PER_DEPOSIT;
        **ctx.accounts.fee_pool.to_account_info().try_borrow_mut_lamports()? += FEE_PER_DEPOSIT;

        vault_info.assign(&System::id());
        vault_info.resize(0)?;
    }

    ctx.accounts.game.status = GameStatus::Settled;
    Ok(())
}

#[derive(Accounts)]
pub struct Settle<'info>
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
