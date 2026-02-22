use anchor_lang::prelude::*;
use ephemeral_vrf_sdk::anchor::vrf;
use ephemeral_vrf_sdk::instructions::{create_request_randomness_ix, RequestRandomnessParams};
use ephemeral_vrf_sdk::types::SerializableAccountMeta;
use crate::instruction::SettleCoinflip;
use crate::state::*;
use crate::errors::*;
use crate::constants::*;

pub fn _request_coinflip(ctx: Context<RequestCoinFlip>) -> Result<()>
{
    require!(ctx.accounts.game.game_type == GameType::CoinFlip, WagerError::InvalidGameType);
    require!(ctx.accounts.game.status == GameStatus::Active, WagerError::GameNotActive);
    require!(ctx.accounts.game.players.len() == 2, WagerError::InvalidAccounts);

    let game_key = ctx.accounts.game.key();
    let (vault_0, _) = Pubkey::find_program_address(
        &[VAULT_PDA, game_key.as_ref(), ctx.accounts.game.players[0].as_ref()],
        &crate::ID,
    );
    let (vault_1, _) = Pubkey::find_program_address(
        &[VAULT_PDA, game_key.as_ref(), ctx.accounts.game.players[1].as_ref()],
        &crate::ID,
    );
    let (fee_pool, _) = Pubkey::find_program_address(&[FEE_POOL_PDA], &crate::ID);

    let callback_accounts = vec![
        SerializableAccountMeta { pubkey: game_key, is_signer: false, is_writable: true },
        SerializableAccountMeta { pubkey: fee_pool, is_signer: false, is_writable: true },
        SerializableAccountMeta { pubkey: vault_0, is_signer: false, is_writable: true },
        SerializableAccountMeta { pubkey: vault_1, is_signer: false, is_writable: true },
        SerializableAccountMeta { pubkey: ctx.accounts.game.players[0], is_signer: false, is_writable: true },
        SerializableAccountMeta { pubkey: ctx.accounts.game.players[1], is_signer: false, is_writable: true },
        SerializableAccountMeta { pubkey: System::id(), is_signer: false, is_writable: false },
    ];

    let ix = create_request_randomness_ix(
        RequestRandomnessParams {
            payer: ctx.accounts.payer.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: crate::ID,
            callback_discriminator: SettleCoinflip::DISCRIMINATOR.to_vec(),
            accounts_metas: Some(callback_accounts),
            caller_seed: {
                let mut seed = [0u8; 32];
                seed[..8].copy_from_slice(&ctx.accounts.game.game_id.to_le_bytes());
                seed
            },
            ..Default::default()
        });
    ctx.accounts.invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;
    Ok(())
}

#[vrf]
#[derive(Accounts)]
pub struct RequestCoinFlip<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub game: Account<'info, Game>,

    /// CHECK: The oracle queue
    #[account(mut, address = ephemeral_vrf_sdk::consts::DEFAULT_QUEUE)]
    pub oracle_queue: AccountInfo<'info>,
}
