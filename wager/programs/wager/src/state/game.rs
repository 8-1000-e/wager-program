use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Game 
{
    pub game_id: u64,
    pub app_host: Pubkey,
    pub wager_amount: u64,
    #[max_len(5)]
    pub players: Vec<Pubkey>,
    pub status: GameStatus,
    pub created_at: i64,
    pub game_type: GameType,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum GameStatus 
{
    Open,
    Locked,
    Active,
    Settled,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum GameType 
{
    CoinFlip,
    Normal
}