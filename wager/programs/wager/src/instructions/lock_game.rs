use anchor_lang::prelude::*;
use crate::constants::GAME_PDA;
use crate::errors::WagerError;
use crate::state::{Game, GameStatus};

pub fn _lock_game(ctx: Context<LockGame>) -> Result<()>
{
    require!(ctx.accounts.game.status == GameStatus::Open, WagerError::GameNotOpen);
    require!(ctx.accounts.game.players.len() >= 2, WagerError::NotEnoughPlayers);
    ctx.accounts.game.status = GameStatus::Locked;
    Ok(())
}

#[derive(Accounts)]
pub struct LockGame<'info>
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
