use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct FeePool 
{
    pub authority: Pubkey,
    pub bump: u8,
}
