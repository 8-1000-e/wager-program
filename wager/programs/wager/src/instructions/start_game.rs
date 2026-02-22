use anchor_lang::prelude::*;
use crate::constants::{GAME_PDA, VAULT_PDA};
use crate::errors::WagerError;
use crate::state::{Game, GameStatus, Vault};

pub fn _start_game(ctx: Context<StartGame>) -> Result<()>
{
    require!(ctx.accounts.game.status == GameStatus::Locked, WagerError::GameNotLocked);
    require!(ctx.remaining_accounts.len() == ctx.accounts.game.players.len(), WagerError::InvalidAccounts);

    let rent = Rent::get()?.minimum_balance(8 + Vault::INIT_SPACE);
    for (i, vault_info) in ctx.remaining_accounts.iter().enumerate()
    {
        let (expected_pda, _) = Pubkey::find_program_address(
            &[VAULT_PDA, ctx.accounts.game.key().as_ref(), ctx.accounts.game.players[i].as_ref()],
            ctx.program_id
        );
        require!(vault_info.key() == expected_pda, WagerError::InvalidVault);
        require!(vault_info.lamports() >= ctx.accounts.game.wager_amount + rent, WagerError::InsufficientWager);
    }

    ctx.accounts.game.status = GameStatus::Active;
    Ok(())
}

#[derive(Accounts)]
pub struct StartGame<'info>
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
}
