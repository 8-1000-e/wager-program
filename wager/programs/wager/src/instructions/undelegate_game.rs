use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;
use crate::state::*;

pub fn _undelegate_game(ctx: Context<UndelegateGame>) -> Result<()> 
{
    commit_and_undelegate_accounts(&ctx.accounts.payer, vec![&ctx.accounts.game.to_account_info()], &ctx.accounts.magic_context, &ctx.accounts.magic_program)?;
    Ok(())
}

#[commit]
#[derive(Accounts)]
pub struct UndelegateGame<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub game: Account<'info, Game>,
}
