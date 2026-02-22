use anchor_lang::prelude::*;
use ephemeral_vrf_sdk::consts::VRF_PROGRAM_IDENTITY;
use ephemeral_vrf_sdk::rnd::random_bool;
use crate::state::*;
use crate::constants::*;
use crate::errors::*;

pub fn _settle_coinflip(ctx: Context<SettleCoinFlip>, randomness: [u8; 32]) -> Result<()>
{
    require!(ctx.accounts.game.game_type == GameType::CoinFlip, WagerError::InvalidGameType);
    require!(ctx.accounts.game.status == GameStatus::Active, WagerError::GameNotActive);

    let game_key = ctx.accounts.game.key();

    // Verify vault PDAs
    let (expected_vault_0, _) = Pubkey::find_program_address(
        &[VAULT_PDA, game_key.as_ref(), ctx.accounts.game.players[0].as_ref()],
        &crate::ID,
    );
    let (expected_vault_1, _) = Pubkey::find_program_address(
        &[VAULT_PDA, game_key.as_ref(), ctx.accounts.game.players[1].as_ref()],
        &crate::ID,
    );
    require!(ctx.accounts.vault_0.key() == expected_vault_0, WagerError::InvalidVault);
    require!(ctx.accounts.vault_1.key() == expected_vault_1, WagerError::InvalidVault);

    // Verify player wallets match game.players
    require!(ctx.accounts.player_0.key() == ctx.accounts.game.players[0], WagerError::InvalidAccounts);
    require!(ctx.accounts.player_1.key() == ctx.accounts.game.players[1], WagerError::InvalidAccounts);

    let result = random_bool(&randomness);
    let winner_index = if result { 0 } else { 1 };
    let winner_wallet = if winner_index == 0 {
        ctx.accounts.player_0.to_account_info()
    } else {
        ctx.accounts.player_1.to_account_info()
    };

    let rent = Rent::get()?.minimum_balance(8 + Vault::INIT_SPACE);

    for vault_info in [
        ctx.accounts.vault_0.to_account_info(),
        ctx.accounts.vault_1.to_account_info(),
    ] {
        let vault_balance = vault_info.lamports();
        **vault_info.try_borrow_mut_lamports()? = 0;
        **winner_wallet.try_borrow_mut_lamports()? += vault_balance - FEE_PER_DEPOSIT - rent;
        **ctx.accounts.fee_pool.to_account_info().try_borrow_mut_lamports()? += FEE_PER_DEPOSIT + rent;

        vault_info.assign(&System::id());
        vault_info.resize(0)?;
    }

    ctx.accounts.game.status = GameStatus::Settled;
    Ok(())
}

#[derive(Accounts)]
pub struct SettleCoinFlip<'info> {
    /// Signer PDA du programme VRF — prouve que c'est l'oracle qui appelle
    #[account(address = VRF_PROGRAM_IDENTITY)]
    pub vrf_program_identity: Signer<'info>,

    #[account(mut)]
    pub game: Account<'info, Game>,

    #[account(
        mut,
        seeds = [FEE_POOL_PDA],
        bump = fee_pool.bump,
    )]
    pub fee_pool: Account<'info, FeePool>,

    /// CHECK: vault PDA du joueur 0, vérifié manuellement
    #[account(mut)]
    pub vault_0: AccountInfo<'info>,

    /// CHECK: vault PDA du joueur 1, vérifié manuellement
    #[account(mut)]
    pub vault_1: AccountInfo<'info>,

    /// CHECK: wallet du joueur 0
    #[account(mut)]
    pub player_0: AccountInfo<'info>,

    /// CHECK: wallet du joueur 1
    #[account(mut)]
    pub player_1: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
