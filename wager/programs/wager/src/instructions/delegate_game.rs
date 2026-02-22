use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use crate::constants::*;

pub fn _delegate_game(ctx: Context<DelegateGame>, game_id: u64) -> Result<()> 
{
    ctx.accounts.delegate_pda(&ctx.accounts.payer, &[GAME_PDA, &game_id.to_le_bytes()], DelegateConfig { ..Default::default() })?;
    Ok(())
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateGame<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: The game PDA to delegate
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
}
