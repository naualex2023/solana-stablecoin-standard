use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, MintTo, Burn as BurnCpi, FreezeAccount as FreezeAccountCpi, ThawAccount as ThawAccountCpi, TransferChecked};
use anchor_spl::token_interface::{Mint as TokenMint, TokenAccount, Token2022};

// Program ID
declare_id!("Hf1s4EvjS79S6kcHdKhaZHVQsnsjqMbJgBEFZfaGDPmw");

// ============================================
// ERROR DEFINITIONS
// ============================================

#[error_code]
pub enum StablecoinError {
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid account")]
    InvalidAccount,
    #[msg("Mint quota exceeded")]
    QuotaExceeded,
    #[msg("Account is frozen")]
    AccountFrozen,
    #[msg("Token is paused")]
    TokenPaused,
    #[msg("Compliance module not enabled")]
    ComplianceNotEnabled,
    #[msg("Permanent delegate not enabled")]
    PermanentDelegateNotEnabled,
    #[msg("Already in blacklist")]
    AlreadyBlacklisted,
    #[msg("Not in blacklist")]
    NotBlacklisted,
    #[msg("Invalid amount")]
    InvalidAmount,
}

// ============================================
// ACCOUNT STRUCTURES
// ============================================

/// Main configuration account for the stablecoin
/// PDA seeds: ["config", mint.key()]
#[account]
pub struct StablecoinConfig {
    pub master_authority: Pubkey,
    pub mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub paused: bool,
    pub bump: u8,

    // Module flags
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,

    // Roles (RBAC)
    pub blacklister: Pubkey,
    pub pauser: Pubkey,
    pub seizer: Pubkey,
}

impl StablecoinConfig {
    pub const LEN: usize = 8  // discriminator
        + 32 // master_authority
        + 32 // mint
        + 4 + 100 // name (max 100 chars)
        + 4 + 10  // symbol (max 10 chars)
        + 4 + 200 // uri (max 200 chars)
        + 1  // decimals
        + 1  // paused
        + 1  // bump
        + 1  // enable_permanent_delegate
        + 1  // enable_transfer_hook
        + 1  // default_account_frozen
        + 32 // blacklister
        + 32 // pauser
        + 32; // seizer
}

/// Minter information with quota tracking
/// PDA seeds: ["minter", config.key(), minter_authority.key()]
#[account]
pub struct MinterInfo {
    pub authority: Pubkey,
    pub quota: u64,
    pub minted: u64,
    pub bump: u8,
}

impl MinterInfo {
    pub const LEN: usize = 8  // discriminator
        + 32 // authority
        + 8  // quota
        + 8  // minted
        + 1; // bump
}

/// Blacklist entry for SSS-2 compliance
/// PDA seeds: ["blacklist", config.key(), user_address.key()]
#[account]
pub struct BlacklistEntry {
    pub user: Pubkey,
    pub reason: String,
    pub timestamp: i64,
    pub bump: u8,
}

impl BlacklistEntry {
    pub const LEN: usize = 8  // discriminator
        + 32 // user
        + 4 + 100 // reason (max 100 chars)
        + 8  // timestamp
        + 1; // bump
}

// ============================================
// INSTRUCTIONS
// ============================================

#[program]
pub mod sss_token {
    use super::*;

    /// Initialize a new stablecoin with specified configuration
    pub fn initialize(
        ctx: Context<Initialize>,
        name: String,
        symbol: String,
        uri: String,
        decimals: u8,
        enable_permanent_delegate: bool,
        enable_transfer_hook: bool,
        default_account_frozen: bool,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        let _clock = Clock::get()?;

        require!(name.len() <= 100, StablecoinError::InvalidAccount);
        require!(symbol.len() <= 10, StablecoinError::InvalidAccount);
        require!(uri.len() <= 200, StablecoinError::InvalidAccount);

        config.master_authority = ctx.accounts.authority.key();
        config.mint = ctx.accounts.mint.key();
        config.name = name;
        config.symbol = symbol;
        config.uri = uri;
        config.decimals = decimals;
        config.paused = false;
        config.bump = ctx.bumps.config;

        config.enable_permanent_delegate = enable_permanent_delegate;
        config.enable_transfer_hook = enable_transfer_hook;
        config.default_account_frozen = default_account_frozen;

        config.blacklister = ctx.accounts.authority.key();
        config.pauser = ctx.accounts.authority.key();
        config.seizer = ctx.accounts.authority.key();

        msg!("Stablecoin initialized: {}", config.symbol);
        Ok(())
    }

    /// Mint tokens to a recipient account
    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        let config = &ctx.accounts.config;
        let minter_info = &mut ctx.accounts.minter_info;

        require!(!config.paused, StablecoinError::TokenPaused);
        require!(
            minter_info.minted + amount <= minter_info.quota,
            StablecoinError::QuotaExceeded
        );

        minter_info.minted += amount;

        let cpi_accounts = MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.minter.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token_2022::mint_to(cpi_ctx, amount)?;

        msg!("Minted {} tokens to {}", amount, ctx.accounts.token_account.key());
        Ok(())
    }

    /// Burn tokens from an account
    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        let config = &ctx.accounts.config;

        require!(!config.paused, StablecoinError::TokenPaused);

        let cpi_accounts = BurnCpi {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.burner.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token_2022::burn(cpi_ctx, amount)?;

        msg!("Burned {} tokens from {}", amount, ctx.accounts.token_account.key());
        Ok(())
    }

    /// Freeze a token account
    pub fn freeze_token_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        let cpi_accounts = FreezeAccountCpi {
            account: ctx.accounts.token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.freeze_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token_2022::freeze_account(cpi_ctx)?;

        msg!("Frozen account {}", ctx.accounts.token_account.key());
        Ok(())
    }

    /// Thaw a token account
    pub fn thaw_token_account(ctx: Context<ThawTokenAccount>) -> Result<()> {
        let cpi_accounts = ThawAccountCpi {
            account: ctx.accounts.token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.freeze_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token_2022::thaw_account(cpi_ctx)?;

        msg!("Thawed account {}", ctx.accounts.token_account.key());
        Ok(())
    }

    /// Pause all token operations
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.paused = true;
        msg!("Token paused");
        Ok(())
    }

    /// Unpause all token operations
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.paused = false;
        msg!("Token unpaused");
        Ok(())
    }

    /// Add a minter with specified quota
    pub fn add_minter(ctx: Context<AddMinter>, quota: u64) -> Result<()> {
        let minter_info = &mut ctx.accounts.minter_info;

        minter_info.authority = ctx.accounts.minter.key();
        minter_info.quota = quota;
        minter_info.minted = 0;
        minter_info.bump = ctx.bumps.minter_info;

        msg!("Added minter {} with quota {}", ctx.accounts.minter.key(), quota);
        Ok(())
    }

    /// Update minter quota
    pub fn update_minter_quota(ctx: Context<UpdateMinterQuota>, new_quota: u64) -> Result<()> {
        let minter_info = &mut ctx.accounts.minter_info;
        minter_info.quota = new_quota;

        msg!("Updated minter quota to {}", new_quota);
        Ok(())
    }

    /// Remove a minter
    pub fn remove_minter(ctx: Context<RemoveMinter>) -> Result<()> {
        let minter_info = &mut ctx.accounts.minter_info;
        minter_info.quota = 0;

        msg!("Removed minter {}", ctx.accounts.minter.key());
        Ok(())
    }

    /// Update roles (blacklister, pauser, seizer)
    pub fn update_roles(
        ctx: Context<UpdateRoles>,
        new_blacklister: Pubkey,
        new_pauser: Pubkey,
        new_seizer: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;

        config.blacklister = new_blacklister;
        config.pauser = new_pauser;
        config.seizer = new_seizer;

        msg!("Updated roles");
        Ok(())
    }

    /// Add an address to the blacklist (SSS-2)
    pub fn add_to_blacklist(ctx: Context<AddToBlacklist>, reason: String) -> Result<()> {
        let config = &ctx.accounts.config;

        require!(config.enable_transfer_hook, StablecoinError::ComplianceNotEnabled);
        require!(reason.len() <= 100, StablecoinError::InvalidAccount);

        let blacklist_entry = &mut ctx.accounts.blacklist_entry;
        let clock = Clock::get()?;

        blacklist_entry.user = ctx.accounts.user.key();
        blacklist_entry.reason = reason;
        blacklist_entry.timestamp = clock.unix_timestamp;
        blacklist_entry.bump = ctx.bumps.blacklist_entry;

        msg!("Added {} to blacklist: {}", ctx.accounts.user.key(), blacklist_entry.reason);
        Ok(())
    }

    /// Remove an address from the blacklist (SSS-2)
    /// The `close = blacklister` constraint on the account handles closing automatically
    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
        let config = &ctx.accounts.config;

        require!(config.enable_transfer_hook, StablecoinError::ComplianceNotEnabled);

        msg!("Removed {} from blacklist", ctx.accounts.user.key());
        Ok(())
    }

    /// Seize tokens from a frozen account (SSS-2)
    pub fn seize(ctx: Context<Seize>, amount: u64) -> Result<()> {
        let config = &ctx.accounts.config;

        require!(
            config.enable_permanent_delegate,
            StablecoinError::PermanentDelegateNotEnabled
        );

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.source_token.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.dest_token.to_account_info(),
            authority: ctx.accounts.seizer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token_2022::transfer_checked(cpi_ctx, amount, config.decimals)?;

        msg!("Seized {} tokens from {}", amount, ctx.accounts.source_token.key());
        Ok(())
    }

    /// Transfer master authority
    pub fn transfer_authority(
        ctx: Context<TransferAuthority>,
        new_master_authority: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.master_authority = new_master_authority;

        msg!("Transferred master authority to {}", new_master_authority);
        Ok(())
    }
}

// ============================================
// CONTEXT STRUCTS
// ============================================

#[derive(Accounts)]
#[instruction(
    name: String,
    symbol: String,
    uri: String,
    decimals: u8,
    enable_permanent_delegate: bool,
    enable_transfer_hook: bool,
    default_account_frozen: bool,
)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = StablecoinConfig::LEN,
        seeds = [b"config", mint.key().as_ref()],
        bump
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        init,
        payer = authority,
        mint::decimals = decimals,
        mint::authority = authority,
        mint::freeze_authority = authority,
        mint::token_program = token_program,
    )]
    pub mint: InterfaceAccount<'info, TokenMint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, TokenMint>,

    #[account(
        mut,
        seeds = [b"minter", config.key().as_ref(), minter.key().as_ref()],
        bump = minter_info.bump
    )]
    pub minter_info: Account<'info, MinterInfo>,

    #[account(mut)]
    pub minter: Signer<'info>,

    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, TokenMint>,

    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub burner: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct FreezeTokenAccount<'info> {
    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, TokenMint>,

    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub freeze_authority: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct ThawTokenAccount<'info> {
    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, TokenMint>,

    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub freeze_authority: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(
        mut,
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        has_one = pauser @ StablecoinError::Unauthorized
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub mint: InterfaceAccount<'info, TokenMint>,

    pub pauser: Signer<'info>,
}

#[derive(Accounts)]
pub struct Unpause<'info> {
    #[account(
        mut,
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        has_one = pauser @ StablecoinError::Unauthorized
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub mint: InterfaceAccount<'info, TokenMint>,

    pub pauser: Signer<'info>,
}

#[derive(Accounts)]
pub struct AddMinter<'info> {
    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        has_one = master_authority @ StablecoinError::Unauthorized
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub mint: InterfaceAccount<'info, TokenMint>,

    /// CHECK: The minter's public key
    pub minter: UncheckedAccount<'info>,

    #[account(
        init,
        payer = master_authority,
        space = MinterInfo::LEN,
        seeds = [b"minter", config.key().as_ref(), minter.key().as_ref()],
        bump
    )]
    pub minter_info: Account<'info, MinterInfo>,

    #[account(mut)]
    pub master_authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateMinterQuota<'info> {
    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        has_one = master_authority @ StablecoinError::Unauthorized
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub mint: InterfaceAccount<'info, TokenMint>,

    #[account(
        mut,
        seeds = [b"minter", config.key().as_ref(), minter.key().as_ref()],
        bump = minter_info.bump
    )]
    pub minter_info: Account<'info, MinterInfo>,

    /// CHECK: The minter's public key
    pub minter: UncheckedAccount<'info>,

    #[account(mut)]
    pub master_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RemoveMinter<'info> {
    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        has_one = master_authority @ StablecoinError::Unauthorized
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub mint: InterfaceAccount<'info, TokenMint>,

    #[account(
        mut,
        seeds = [b"minter", config.key().as_ref(), minter.key().as_ref()],
        bump = minter_info.bump
    )]
    pub minter_info: Account<'info, MinterInfo>,

    /// CHECK: The minter's public key
    pub minter: UncheckedAccount<'info>,

    #[account(mut)]
    pub master_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateRoles<'info> {
    #[account(
        mut,
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        has_one = master_authority @ StablecoinError::Unauthorized
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub mint: InterfaceAccount<'info, TokenMint>,

    #[account(mut)]
    pub master_authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(reason: String)]
pub struct AddToBlacklist<'info> {
    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        has_one = blacklister @ StablecoinError::Unauthorized
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub mint: InterfaceAccount<'info, TokenMint>,

    #[account(mut)]
    pub blacklister: Signer<'info>,

    /// CHECK: The user to blacklist
    pub user: UncheckedAccount<'info>,

    #[account(
        init,
        payer = blacklister,
        space = BlacklistEntry::LEN,
        seeds = [b"blacklist", config.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveFromBlacklist<'info> {
    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        has_one = blacklister @ StablecoinError::Unauthorized
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub mint: InterfaceAccount<'info, TokenMint>,

    #[account(mut)]
    pub blacklister: Signer<'info>,

    /// CHECK: The user to remove from blacklist
    pub user: UncheckedAccount<'info>,

    #[account(
        mut,
        close = blacklister,
        seeds = [b"blacklist", config.key().as_ref(), user.key().as_ref()],
        bump = blacklist_entry.bump
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Seize<'info> {
    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        has_one = seizer @ StablecoinError::Unauthorized
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub mint: InterfaceAccount<'info, TokenMint>,

    #[account(mut)]
    pub source_token: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub dest_token: InterfaceAccount<'info, TokenAccount>,

    pub seizer: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    #[account(
        mut,
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        has_one = master_authority @ StablecoinError::Unauthorized
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub mint: InterfaceAccount<'info, TokenMint>,

    #[account(mut)]
    pub master_authority: Signer<'info>,
}
