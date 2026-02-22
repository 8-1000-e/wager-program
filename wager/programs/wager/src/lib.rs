use anchor_lang::prelude::*;

mod constants;
mod errors;
mod state;
mod instructions;

use instructions::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

declare_id!("4a48fH7tECz8ZPKCixUqGrvc1JqNk6FaivPxF2W4krpt");

#[ephemeral]
#[program]
pub mod wager {
    use super::*;

    pub fn init_fee_pool(ctx: Context<InitFeePool>) -> Result<()> {
        instructions::init_fee_pool::_init_fee_pool(ctx)
    }

    pub fn create_game(ctx: Context<CreateGame>, game_id: u64, wager_amount: u64, game_type: state::GameType) -> Result<()> {
        instructions::create_game::_create_game(ctx, game_id, wager_amount, game_type)
    }

    pub fn register_player(ctx: Context<RegisterPlayer>, player: Pubkey) -> Result<()> {
        instructions::register_player::_register_player(ctx, player)
    }

    pub fn lock_game(ctx: Context<LockGame>) -> Result<()> {
        instructions::lock_game::_lock_game(ctx)
    }

    pub fn start_game(ctx: Context<StartGame>) -> Result<()> {
        instructions::start_game::_start_game(ctx)
    }

    pub fn settle(ctx: Context<Settle>, winner_index: u8) -> Result<()> {
        instructions::settle::_settle(ctx, winner_index)
    }

    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        instructions::cancel::_cancel(ctx)
    }

    pub fn claim_fees(ctx: Context<ClaimFees>) -> Result<()> {
        instructions::claim_fees::_claim_fees(ctx)
    }

    pub fn request_coinflip(ctx: Context<RequestCoinFlip>) -> Result<()> {
        instructions::request_coinflip::_request_coinflip(ctx)
    }

    pub fn settle_coinflip(ctx: Context<SettleCoinFlip>, randomness: [u8; 32]) -> Result<()> {
        instructions::settle_coinflip::_settle_coinflip(ctx, randomness)
    }

    pub fn delegate_game(ctx: Context<DelegateGame>, game_id: u64) -> Result<()> {
        instructions::delegate_game::_delegate_game(ctx, game_id)
    }

    pub fn schedule_auto_cancel(ctx: Context<ScheduleAutoCancel>, args: ScheduleCancelArgs) -> Result<()> {
        instructions::schedule_auto_cancel::_schedule_auto_cancel(ctx, args)
    }

    pub fn undelegate_game(ctx: Context<UndelegateGame>) -> Result<()> {
        instructions::undelegate_game::_undelegate_game(ctx)
    }
}
