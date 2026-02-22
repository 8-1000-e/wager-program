use anchor_lang::prelude::*;
use crate::constants::{GAME_PDA, VAULT_PDA};
use crate::errors::WagerError;
use crate::state::{Game, GameStatus, Vault};

pub fn _register_player(ctx: Context<RegisterPlayer>, player: Pubkey) -> Result<()>
{
    require!(ctx.accounts.game.status == GameStatus::Open, WagerError::GameNotOpen);
    require!(!ctx.accounts.game.players.contains(&player), WagerError::PlayerAlreadyRegistered);

    ctx.accounts.vault.bump = ctx.bumps.vault;

    ctx.accounts.game.players.push(player);

    Ok(())
}

#[derive(Accounts)]
#[instruction(player: Pubkey)]
pub struct RegisterPlayer<'info>
{
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_PDA, game.key().as_ref(), player.as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        constraint = game.app_host == payer.key() @ WagerError::Unauthorized,
        seeds = [GAME_PDA, &game.game_id.to_le_bytes()],
        bump = game.bump,
    )]
    pub game: Account<'info, Game>,

    pub system_program: Program<'info, System>,
}
