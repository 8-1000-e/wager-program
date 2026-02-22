use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Vault 
{
    pub bump: u8,
}
