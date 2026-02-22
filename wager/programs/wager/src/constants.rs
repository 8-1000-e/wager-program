// PDA Seeds
pub const FEE_POOL_PDA: &[u8] = b"fee_pool";
pub const GAME_PDA: &[u8] = b"game";
pub const VAULT_PDA: &[u8] = b"vault";
// Fee per deposit (lamports) — just enough to cover tx fees
pub const FEE_PER_DEPOSIT: u64 = 5000;

// Timeout duration (seconds) — 30 minutes
pub const TIMEOUT_DURATION: u64 = 30 * 60;
