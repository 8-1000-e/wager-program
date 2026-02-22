use anchor_lang::prelude::*;

#[error_code]
pub enum WagerError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid wager amount")]
    InvalidWagerAmount,
    #[msg("Game is not open")]
    GameNotOpen,
    #[msg("Game is not locked")]
    GameNotLocked,
    #[msg("Game is not active")]
    GameNotActive,
    #[msg("Game is already settled")]
    GameSettled,
    #[msg("Game has not timed out")]
    GameNotTimedOut,
    #[msg("Player already registered")]
    PlayerAlreadyRegistered,
    #[msg("Invalid vault account")]
    InvalidVault,
    #[msg("Insufficient wager deposit")]
    InsufficientWager,
    #[msg("Invalid winner index")]
    InvalidWinnerIndex,
    #[msg("Invalid remaining accounts")]
    InvalidAccounts,
    #[msg("Invalid winner account")]
    InvalidWinnerAccount,
    #[msg("Invalid player account")]
    InvalidPlayerAccount,
    #[msg("Not enough lamports")]
    NotEnoughLamports,
    #[msg("Not enough players to start the game")]
    NotEnoughPlayers,
    #[msg("Invalid game type for this operation")]
    InvalidGameType,
}
