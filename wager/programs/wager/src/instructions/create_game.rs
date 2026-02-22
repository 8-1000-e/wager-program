use anchor_lang::prelude::*;
use crate::constants::{GAME_PDA, FEE_PER_DEPOSIT};
use crate::errors::WagerError;
use crate::state::{Game, GameStatus, GameType};

pub fn _create_game(ctx: Context<CreateGame>, game_id: u64, wager_amount: u64, game_type: GameType) -> Result<()>
{
    require!(wager_amount > FEE_PER_DEPOSIT, WagerError::InvalidWagerAmount);

    ctx.accounts.game.game_type = game_type;
    ctx.accounts.game.game_id = game_id;
    ctx.accounts.game.app_host = ctx.accounts.payer.key();
    ctx.accounts.game.wager_amount = wager_amount;
    ctx.accounts.game.players = Vec::new();
    ctx.accounts.game.status = GameStatus::Open;
    ctx.accounts.game.created_at = Clock::get()?.unix_timestamp;
    ctx.accounts.game.bump = ctx.bumps.game;
    Ok(())
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct CreateGame<'info>
{
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + Game::INIT_SPACE,
        seeds = [GAME_PDA, &game_id.to_le_bytes()],
        bump
    )]
    pub game: Account<'info, Game>,
    pub system_program: Program<'info, System>,
}
