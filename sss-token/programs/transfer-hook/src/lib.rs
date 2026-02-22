use anchor_lang::prelude::*;

// ============================================
// ERROR DEFINITIONS
// ============================================

#[error_code]
pub enum TransferHookError {
    #[msg("Sender is blacklisted")]
    SenderBlacklisted,
    #[msg("Recipient is blacklisted")]
    RecipientBlacklisted,
    #[msg("Invalid transfer hook account")]
    InvalidTransferHookAccount,
    #[msg("Invalid mint account")]
    InvalidMintAccount,
    #[msg("Transfer is paused")]
    TransferPaused,
}

// ============================================
// ACCOUNT STRUCTURES
// ============================================

/// Extra account required for transfer hook validation
/// This account holds reference to the stablecoin config
#[account]
pub struct TransferHookData {
    pub stablecoin_program: Pubkey,
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub paused: bool,
    pub bump: u8,
}

impl TransferHookData {
    pub const LEN: usize = 8 + // discriminator
        32 + // stablecoin_program
        32 + // mint
        32 + // authority
        1 +  // paused
        1;   // bump
}

// ============================================
// INSTRUCTIONS
// ============================================

#[program]
pub mod transfer_hook {
    use super::*;

    /// Initialize the transfer hook data account
    pub fn initialize(
        ctx: Context<InitializeTransferHook>,
    ) -> Result<()> {
        let hook_data = &mut ctx.accounts.hook_data;

        hook_data.stablecoin_program = ctx.accounts.stablecoin_program.key();
        hook_data.mint = ctx.accounts.mint.key();
        hook_data.authority = ctx.accounts.authority.key();
        hook_data.paused = false;
        hook_data.bump = ctx.bumps.hook_data;

        msg!("Transfer hook initialized for mint {}", ctx.accounts.mint.key());
        Ok(())
    }

    /// Pause transfer hook validation
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        let hook_data = &mut ctx.accounts.hook_data;
        hook_data.paused = true;
        msg!("Transfer hook paused");
        Ok(())
    }

    /// Unpause transfer hook validation
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        let hook_data = &mut ctx.accounts.hook_data;
        hook_data.paused = false;
        msg!("Transfer hook unpaused");
        Ok(())
    }

    /// The main transfer hook function called by Token-2022
    /// This validates that neither sender nor recipient is blacklisted
    pub fn extra_account_metas(
        ctx: Context<ExtraAccountMetas>,
    ) -> Result<()> {
        // This instruction returns the accounts needed for the transfer hook
        // The actual validation happens in the transfer hook instruction
        Ok(())
    }

    /// Execute transfer hook validation
    /// This is called during every token transfer if the transfer hook extension is enabled
    pub fn execute(ctx: Context<ExecuteTransferHook>, amount: u64) -> Result<()> {
        let hook_data = &ctx.accounts.hook_data;
        let stablecoin_program = &ctx.accounts.stablecoin_program;

        // Check if transfer hook is paused
        require!(!hook_data.paused, TransferHookError::TransferPaused);

        // Get sender and recipient addresses from the source and destination token accounts
        let sender = &ctx.accounts.source_token.owner;
        let recipient = &ctx.accounts.dest_token.owner;

        // Check if sender is blacklisted by trying to find the blacklist entry
        let sender_blacklist_seeds = &[
            b"blacklist",
            hook_data.mint.as_ref(),
            sender.as_ref(),
        ];

        let sender_blacklist_info = &ctx.accounts.sender_blacklist;

        // If sender blacklist account exists and is valid, reject transfer
        if sender_blacklist_info.data.borrow().len() > 0 {
            return Err(TransferHookError::SenderBlacklisted.into());
        }

        // Check if recipient is blacklisted
        let recipient_blacklist_info = &ctx.accounts.recipient_blacklist;

        // If recipient blacklist account exists and is valid, reject transfer
        if recipient_blacklist_info.data.borrow().len() > 0 {
            return Err(TransferHookError::RecipientBlacklisted.into());
        }

        msg!("Transfer validated: {} tokens from {} to {}", amount, sender, recipient);
        Ok(())
    }

    /// Update transfer hook authority
    pub fn update_authority(
        ctx: Context<UpdateAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        let hook_data = &mut ctx.accounts.hook_data;
        hook_data.authority = new_authority;

        msg!("Updated transfer hook authority to {}", new_authority);
        Ok(())
    }
}

// ============================================
// CONTEXT STRUCTURES
// ============================================

#[derive(Accounts)]
pub struct InitializeTransferHook<'info> {
    #[account(
        init,
        payer = authority,
        space = TransferHookData::LEN,
        seeds = [b"transfer_hook", mint.key().as_ref()],
        bump
    )]
    pub hook_data: Account<'info, TransferHookData>,
    
    pub mint: Account<'info, token_2022::Mint>,
    
    /// CHECK: The stablecoin program ID
    pub stablecoin_program: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(
        mut,
        seeds = [b"transfer_hook", mint.key().as_ref()],
        bump = hook_data.bump,
        has_one = authority @ TransferHookError::InvalidTransferHookAccount
    )]
    pub hook_data: Account<'info, TransferHookData>,
    
    pub mint: Account<'info, token_2022::Mint>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Unpause<'info> {
    #[account(
        mut,
        seeds = [b"transfer_hook", mint.key().as_ref()],
        bump = hook_data.bump,
        has_one = authority @ TransferHookError::InvalidTransferHookAccount
    )]
    pub hook_data: Account<'info, TransferHookData>,
    
    pub mint: Account<'info, token_2022::Mint>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExtraAccountMetas<'info> {
    #[account(
        seeds = [b"transfer_hook", mint.key().as_ref()],
        bump = hook_data.bump
    )]
    pub hook_data: Account<'info, TransferHookData>,
    
    pub mint: Account<'info, token_2022::Mint>,
}

#[derive(Accounts)]
pub struct ExecuteTransferHook<'info> {
    #[account(
        seeds = [b"transfer_hook", mint.key().as_ref()],
        bump = hook_data.bump
    )]
    pub hook_data: Account<'info, TransferHookData>,
    
    /// CHECK: The stablecoin program that created the blacklist
    pub stablecoin_program: UncheckedAccount<'info>,
    
    #[account(
        constraint = source_token.mint == hook_data.mint @ TransferHookError::InvalidMintAccount
    )]
    pub source_token: Account<'info, token_2022::TokenAccount>,
    
    #[account(
        constraint = dest_token.mint == hook_data.mint @ TransferHookError::InvalidMintAccount
    )]
    pub dest_token: Account<'info, token_2022::TokenAccount>,
    
    /// CHECK: Optional account for sender blacklist check
    /// If this account exists and has data, the sender is blacklisted
    #[account(
        seeds = [b"blacklist", hook_data.mint.as_ref(), source_token.owner.as_ref()],
        bump
    )]
    pub sender_blacklist: UncheckedAccount<'info>,
    
    /// CHECK: Optional account for recipient blacklist check
    /// If this account exists and has data, the recipient is blacklisted
    #[account(
        seeds = [b"blacklist", hook_data.mint.as_ref(), dest_token.owner.as_ref()],
        bump
    )]
    pub recipient_blacklist: UncheckedAccount<'info>,
    
    pub mint: Account<'info, token_2022::Mint>,
}

#[derive(Accounts)]
pub struct UpdateAuthority<'info> {
    #[account(
        mut,
        seeds = [b"transfer_hook", mint.key().as_ref()],
        bump = hook_data.bump,
        has_one = authority @ TransferHookError::InvalidTransferHookAccount
    )]
    pub hook_data: Account<'info, TransferHookData>,
    
    pub mint: Account<'info, token_2022::Mint>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
}