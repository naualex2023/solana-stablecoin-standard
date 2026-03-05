use solana_program_test::*;
use solana_sdk::{
    account::Account,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_instruction,
};
use std::mem;

// Program IDs
const SSS_TOKEN_PROGRAM_ID: &str = "Hf1s4EvjS79S6kcHdKhaZHVQsnsjqMbJgBEFZfaGDPmw";
const TOKEN_2022_PROGRAM_ID: &str = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

fn program_test() -> ProgramTest {
    ProgramTest::new(
        "sss_token",
        sss_token::ID,
        processor!(sss_token::Processor),
    )
}

#[tokio::test]
async fn test_initialize_sss1_minimal_stablecoin() {
    let mut context = program_test().start_with_context().await;
    
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    
    // Calculate config PDA
    let (config_pda, config_bump) = Pubkey::find_program_address(
        &[b"config", mint_pubkey.as_ref()],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    // Initialize with SSS-1 preset (minimal)
    let name = "Test Token";
    let symbol = "TEST";
    let uri = "https://example.com/metadata.json";
    let decimals: u8 = 6;
    let enable_permanent_delegate = false;
    let enable_transfer_hook = false;
    let default_account_frozen = false;
    
    let instruction = sss_token::instruction::Initialize {
        name: name.to_string(),
        symbol: symbol.to_string(),
        uri: uri.to_string(),
        decimals,
        enable_permanent_delegate,
        enable_transfer_hook,
        default_account_frozen,
    };
    
    let accounts = sss_token::accounts::Initialize {
        config: config_pda,
        mint: mint_pubkey,
        authority: context.payer.pubkey(),
        system_program: solana_sdk::system_program::ID,
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    context
        .banks_client
        .process_instruction(
            &instruction.accounts(accounts),
            vec![&context.payer],
        )
        .await
        .unwrap();
    
    // Verify config account
    let config_account = context
        .banks_client
        .get_account(config_pda)
        .await
        .unwrap()
        .unwrap();
    
    let config = sss_token::state::StablecoinConfig::try_deserialize(&config_account.data).unwrap();
    
    assert_eq!(config.name, name);
    assert_eq!(config.symbol, symbol);
    assert_eq!(config.uri, uri);
    assert_eq!(config.decimals, decimals);
    assert_eq!(config.paused, false);
    assert_eq!(config.enable_permanent_delegate, false);
    assert_eq!(config.enable_transfer_hook, false);
    assert_eq!(config.default_account_frozen, false);
    assert_eq!(config.master_authority, context.payer.pubkey());
}

#[tokio::test]
async fn test_initialize_sss2_compliant_stablecoin() {
    let mut context = program_test().start_with_context().await;
    
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    
    let (config_pda, _config_bump) = Pubkey::find_program_address(
        &[b"config", mint_pubkey.as_ref()],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    // Initialize with SSS-2 preset (compliant)
    let instruction = sss_token::instruction::Initialize {
        name: "Compliant Token".to_string(),
        symbol: "COMP".to_string(),
        uri: "https://example.com/compliant.json".to_string(),
        decimals: 6,
        enable_permanent_delegate: true,
        enable_transfer_hook: true,
        default_account_frozen: false,
    };
    
    let accounts = sss_token::accounts::Initialize {
        config: config_pda,
        mint: mint_pubkey,
        authority: context.payer.pubkey(),
        system_program: solana_sdk::system_program::ID,
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    context
        .banks_client
        .process_instruction(
            &instruction.accounts(accounts),
            vec![&context.payer],
        )
        .await
        .unwrap();
    
    // Verify config
    let config_account = context
        .banks_client
        .get_account(config_pda)
        .await
        .unwrap()
        .unwrap();
    
    let config = sss_token::state::StablecoinConfig::try_deserialize(&config_account.data).unwrap();
    
    assert_eq!(config.enable_permanent_delegate, true);
    assert_eq!(config.enable_transfer_hook, true);
}

#[tokio::test]
async fn test_fail_to_initialize_twice() {
    let mut context = program_test().start_with_context().await;
    
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    
    let (config_pda, _config_bump) = Pubkey::find_program_address(
        &[b"config", mint_pubkey.as_ref()],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    let instruction = sss_token::instruction::Initialize {
        name: "Test Token".to_string(),
        symbol: "TEST".to_string(),
        uri: "https://example.com/metadata.json".to_string(),
        decimals: 6,
        enable_permanent_delegate: false,
        enable_transfer_hook: false,
        default_account_frozen: false,
    };
    
    let accounts = sss_token::accounts::Initialize {
        config: config_pda,
        mint: mint_pubkey,
        authority: context.payer.pubkey(),
        system_program: solana_sdk::system_program::ID,
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    // First initialization should succeed
    context
        .banks_client
        .process_instruction(
            &instruction.accounts(accounts.clone()),
            vec![&context.payer],
        )
        .await
        .unwrap();
    
    // Second initialization should fail
    let result = context
        .banks_client
        .process_instruction(
            &instruction.accounts(accounts),
            vec![&context.payer],
        )
        .await;
    
    assert!(result.is_err());
}

#[tokio::test]
async fn test_add_minter() {
    let mut context = program_test().start_with_context().await;
    
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let minter_keypair = Keypair::new();
    
    let (config_pda, config_bump) = Pubkey::find_program_address(
        &[b"config", mint_pubkey.as_ref()],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    let (minter_info_pda, minter_info_bump) = Pubkey::find_program_address(
        &[
            b"minter",
            config_pda.as_ref(),
            minter_keypair.pubkey().as_ref(),
        ],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    // Initialize config first
    let init_instruction = sss_token::instruction::Initialize {
        name: "Test Token".to_string(),
        symbol: "TEST".to_string(),
        uri: "https://example.com/metadata.json".to_string(),
        decimals: 6,
        enable_permanent_delegate: false,
        enable_transfer_hook: false,
        default_account_frozen: false,
    };
    
    let init_accounts = sss_token::accounts::Initialize {
        config: config_pda,
        mint: mint_pubkey,
        authority: context.payer.pubkey(),
        system_program: solana_sdk::system_program::ID,
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    context
        .banks_client
        .process_instruction(
            &init_instruction.accounts(init_accounts),
            vec![&context.payer],
        )
        .await
        .unwrap();
    
    // Add minter
    let quota: u64 = 1_000_000 * 10u64.pow(6);
    
    let add_minter_instruction = sss_token::instruction::AddMinter { quota };
    let add_minter_accounts = sss_token::accounts::AddMinter {
        config: config_pda,
        mint: mint_pubkey,
        minter: minter_keypair.pubkey(),
        minter_info: minter_info_pda,
        master_authority: context.payer.pubkey(),
        system_program: solana_sdk::system_program::ID,
    };
    
    context
        .banks_client
        .process_instruction(
            &add_minter_instruction.accounts(add_minter_accounts),
            vec![&context.payer],
        )
        .await
        .unwrap();
    
    // Verify minter info
    let minter_info_account = context
        .banks_client
        .get_account(minter_info_pda)
        .await
        .unwrap()
        .unwrap();
    
    let minter_info = sss_token::state::MinterInfo::try_deserialize(&minter_info_account.data).unwrap();
    
    assert_eq!(minter_info.authority, minter_keypair.pubkey());
    assert_eq!(minter_info.quota, quota);
    assert_eq!(minter_info.minted, 0);
}

#[tokio::test]
async fn test_remove_minter() {
    let mut context = program_test().start_with_context().await;
    
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let minter_keypair = Keypair::new();
    
    let (config_pda, _config_bump) = Pubkey::find_program_address(
        &[b"config", mint_pubkey.as_ref()],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    let (minter_info_pda, _minter_info_bump) = Pubkey::find_program_address(
        &[
            b"minter",
            config_pda.as_ref(),
            minter_keypair.pubkey().as_ref(),
        ],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    // Initialize config and add minter
    let init_instruction = sss_token::instruction::Initialize {
        name: "Test Token".to_string(),
        symbol: "TEST".to_string(),
        uri: "https://example.com/metadata.json".to_string(),
        decimals: 6,
        enable_permanent_delegate: false,
        enable_transfer_hook: false,
        default_account_frozen: false,
    };
    
    let init_accounts = sss_token::accounts::Initialize {
        config: config_pda,
        mint: mint_pubkey,
        authority: context.payer.pubkey(),
        system_program: solana_sdk::system_program::ID,
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    context
        .banks_client
        .process_instruction(
            &init_instruction.accounts(init_accounts),
            vec![&context.payer],
        )
        .await
        .unwrap();
    
    let add_minter_instruction = sss_token::instruction::AddMinter { quota: 1_000_000 };
    let add_minter_accounts = sss_token::accounts::AddMinter {
        config: config_pda,
        mint: mint_pubkey,
        minter: minter_keypair.pubkey(),
        minter_info: minter_info_pda,
        master_authority: context.payer.pubkey(),
        system_program: solana_sdk::system_program::ID,
    };
    
    context
        .banks_client
        .process_instruction(
            &add_minter_instruction.accounts(add_minter_accounts),
            vec![&context.payer],
        )
        .await
        .unwrap();
    
    // Remove minter
    let remove_minter_instruction = sss_token::instruction::RemoveMinter {};
    let remove_minter_accounts = sss_token::accounts::RemoveMinter {
        config: config_pda,
        mint: mint_pubkey,
        minter: minter_keypair.pubkey(),
        minter_info: minter_info_pda,
        master_authority: context.payer.pubkey(),
    };
    
    context
        .banks_client
        .process_instruction(
            &remove_minter_instruction.accounts(remove_minter_accounts),
            vec![&context.payer],
        )
        .await
        .unwrap();
    
    // Verify quota is set to 0
    let minter_info_account = context
        .banks_client
        .get_account(minter_info_pda)
        .await
        .unwrap()
        .unwrap();
    
    let minter_info = sss_token::state::MinterInfo::try_deserialize(&minter_info_account.data).unwrap();
    assert_eq!(minter_info.quota, 0);
}

#[tokio::test]
async fn test_pause_and_unpause() {
    let mut context = program_test().start_with_context().await;
    
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    
    let (config_pda, _config_bump) = Pubkey::find_program_address(
        &[b"config", mint_pubkey.as_ref()],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    // Initialize config
    let init_instruction = sss_token::instruction::Initialize {
        name: "Test Token".to_string(),
        symbol: "TEST".to_string(),
        uri: "https://example.com/metadata.json".to_string(),
        decimals: 6,
        enable_permanent_delegate: false,
        enable_transfer_hook: false,
        default_account_frozen: false,
    };
    
    let init_accounts = sss_token::accounts::Initialize {
        config: config_pda,
        mint: mint_pubkey,
        authority: context.payer.pubkey(),
        system_program: solana_sdk::system_program::ID,
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    context
        .banks_client
        .process_instruction(
            &init_instruction.accounts(init_accounts),
            vec![&context.payer],
        )
        .await
        .unwrap();
    
    // Pause
    let pause_instruction = sss_token::instruction::Pause {};
    let pause_accounts = sss_token::accounts::Pause {
        config: config_pda,
        mint: mint_pubkey,
        pauser: context.payer.pubkey(),
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    context
        .banks_client
        .process_instruction(
            &pause_instruction.accounts(pause_accounts),
            vec![&context.payer],
        )
        .await
        .unwrap();
    
    // Verify paused
    let config_account = context
        .banks_client
        .get_account(config_pda)
        .await
        .unwrap()
        .unwrap();
    
    let config = sss_token::state::StablecoinConfig::try_deserialize(&config_account.data).unwrap();
    assert_eq!(config.paused, true);
    
    // Unpause
    let unpause_instruction = sss_token::instruction::Unpause {};
    let unpause_accounts = sss_token::accounts::Unpause {
        config: config_pda,
        mint: mint_pubkey,
        pauser: context.payer.pubkey(),
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    context
        .banks_client
        .process_instruction(
            &unpause_instruction.accounts(unpause_accounts),
            vec![&context.payer],
        )
        .await
        .unwrap();
    
    // Verify unpaused
    let config_account = context
        .banks_client
        .get_account(config_pda)
        .await
        .unwrap()
        .unwrap();
    
    let config = sss_token::state::StablecoinConfig::try_deserialize(&config_account.data).unwrap();
    assert_eq!(config.paused, false);
}

#[tokio::test]
async fn test_blacklist_operations_sss2() {
    let mut context = program_test().start_with_context().await;
    
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let user_keypair = Keypair::new();
    
    let (config_pda, _config_bump) = Pubkey::find_program_address(
        &[b"config", mint_pubkey.as_ref()],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    let (blacklist_entry_pda, _bl_bump) = Pubkey::find_program_address(
        &[b"blacklist", config_pda.as_ref(), user_keypair.pubkey().as_ref()],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    // Initialize SSS-2 config
    let init_instruction = sss_token::instruction::Initialize {
        name: "Compliant Token".to_string(),
        symbol: "COMP".to_string(),
        uri: "https://example.com/compliant.json".to_string(),
        decimals: 6,
        enable_permanent_delegate: true,
        enable_transfer_hook: true,
        default_account_frozen: false,
    };
    
    let init_accounts = sss_token::accounts::Initialize {
        config: config_pda,
        mint: mint_pubkey,
        authority: context.payer.pubkey(),
        system_program: solana_sdk::system_program::ID,
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    context
        .banks_client
        .process_instruction(
            &init_instruction.accounts(init_accounts),
            vec![&context.payer],
        )
        .await
        .unwrap();
    
    // Add to blacklist
    let reason = "Suspicious activity";
    let add_bl_instruction = sss_token::instruction::AddToBlacklist {
        reason: reason.to_string(),
    };
    let add_bl_accounts = sss_token::accounts::AddToBlacklist {
        config: config_pda,
        mint: mint_pubkey,
        blacklister: context.payer.pubkey(),
        user: user_keypair.pubkey(),
        blacklist_entry: blacklist_entry_pda,
        system_program: solana_sdk::system_program::ID,
    };
    
    context
        .banks_client
        .process_instruction(
            &add_bl_instruction.accounts(add_bl_accounts),
            vec![&context.payer],
        )
        .await
        .unwrap();
    
    // Verify blacklist entry
    let bl_account = context
        .banks_client
        .get_account(blacklist_entry_pda)
        .await
        .unwrap()
        .unwrap();
    
    let bl_entry = sss_token::state::BlacklistEntry::try_deserialize(&bl_account.data).unwrap();
    assert_eq!(bl_entry.user, user_keypair.pubkey());
    assert_eq!(bl_entry.reason, reason);
    assert!(bl_entry.timestamp > 0);
    
    // Remove from blacklist
    let remove_bl_instruction = sss_token::instruction::RemoveFromBlacklist {};
    let remove_bl_accounts = sss_token::accounts::RemoveFromBlacklist {
        config: config_pda,
        mint: mint_pubkey,
        blacklister: context.payer.pubkey(),
        user: user_keypair.pubkey(),
        blacklist_entry: blacklist_entry_pda,
        system_program: solana_sdk::system_program::ID,
    };
    
    context
        .banks_client
        .process_instruction(
            &remove_bl_instruction.accounts(remove_bl_accounts),
            vec![&context.payer],
        )
        .await
        .unwrap();
    
    // Verify account is closed
    let result = context
        .banks_client
        .get_account(blacklist_entry_pda)
        .await;
    
    assert!(result.is_err());
}

#[tokio::test]
async fn test_fail_to_blacklist_without_transfer_hook() {
    let mut context = program_test().start_with_context().await;
    
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let user_keypair = Keypair::new();
    
    let (config_pda, _config_bump) = Pubkey::find_program_address(
        &[b"config", mint_pubkey.as_ref()],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    let (blacklist_entry_pda, _bl_bump) = Pubkey::find_program_address(
        &[b"blacklist", config_pda.as_ref(), user_keypair.pubkey().as_ref()],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    // Initialize WITHOUT transfer hook (SSS-1)
    let init_instruction = sss_token::instruction::Initialize {
        name: "Minimal Token".to_string(),
        symbol: "MIN".to_string(),
        uri: "https://example.com/minimal.json".to_string(),
        decimals: 6,
        enable_permanent_delegate: false,
        enable_transfer_hook: false,
        default_account_frozen: false,
    };
    
    let init_accounts = sss_token::accounts::Initialize {
        config: config_pda,
        mint: mint_pubkey,
        authority: context.payer.pubkey(),
        system_program: solana_sdk::system_program::ID,
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    context
        .banks_client
        .process_instruction(
            &init_instruction.accounts(init_accounts),
            vec![&context.payer],
        )
        .await
        .unwrap();
    
    // Try to add to blacklist (should fail)
    let add_bl_instruction = sss_token::instruction::AddToBlacklist {
        reason: "Test".to_string(),
    };
    let add_bl_accounts = sss_token::accounts::AddToBlacklist {
        config: config_pda,
        mint: mint_pubkey,
        blacklister: context.payer.pubkey(),
        user: user_keypair.pubkey(),
        blacklist_entry: blacklist_entry_pda,
        system_program: solana_sdk::system_program::ID,
    };
    
    let result = context
        .banks_client
        .process_instruction(
            &add_bl_instruction.accounts(add_bl_accounts),
            vec![&context.payer],
        )
        .await;
    
    assert!(result.is_err());
}

#[tokio::test]
async fn test_transfer_authority() {
    let mut context = program_test().start_with_context().await;
    
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let new_authority_keypair = Keypair::new();
    
    let (config_pda, _config_bump) = Pubkey::find_program_address(
        &[b"config", mint_pubkey.as_ref()],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    // Initialize config
    let init_instruction = sss_token::instruction::Initialize {
        name: "Test Token".to_string(),
        symbol: "TEST".to_string(),
        uri: "https://example.com/metadata.json".to_string(),
        decimals: 6,
        enable_permanent_delegate: false,
        enable_transfer_hook: false,
        default_account_frozen: false,
    };
    
    let init_accounts = sss_token::accounts::Initialize {
        config: config_pda,
        mint: mint_pubkey,
        authority: context.payer.pubkey(),
        system_program: solana_sdk::system_program::ID,
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    context
        .banks_client
        .process_instruction(
            &init_instruction.accounts(init_accounts),
            vec![&context.payer],
        )
        .await
        .unwrap();
    
    // Transfer authority
    let transfer_instruction = sss_token::instruction::TransferAuthority {
        new_master_authority: new_authority_keypair.pubkey(),
    };
    let transfer_accounts = sss_token::accounts::TransferAuthority {
        config: config_pda,
        mint: mint_pubkey,
        master_authority: context.payer.pubkey(),
    };
    
    context
        .banks_client
        .process_instruction(
            &transfer_instruction.accounts(transfer_accounts),
            vec![&context.payer],
        )
        .await
        .unwrap();
    
    // Verify authority changed
    let config_account = context
        .banks_client
        .get_account(config_pda)
        .await
        .unwrap()
        .unwrap();
    
    let config = sss_token::state::StablecoinConfig::try_deserialize(&config_account.data).unwrap();
    assert_eq!(config.master_authority, new_authority_keypair.pubkey());
}

#[tokio::test]
async fn test_update_roles() {
    let mut context = program_test().start_with_context().await;
    
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let new_blacklister_keypair = Keypair::new();
    let new_pauser_keypair = Keypair::new();
    let new_seizer_keypair = Keypair::new();
    
    let (config_pda, _config_bump) = Pubkey::find_program_address(
        &[b"config", mint_pubkey.as_ref()],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    // Initialize config
    let init_instruction = sss_token::instruction::Initialize {
        name: "Test Token".to_string(),
        symbol: "TEST".to_string(),
        uri: "https://example.com/metadata.json".to_string(),
        decimals: 6,
        enable_permanent_delegate: true,
        enable_transfer_hook: true,
        default_account_frozen: false,
    };
    
    let init_accounts = sss_token::accounts::Initialize {
        config: config_pda,
        mint: mint_pubkey,
        authority: context.payer.pubkey(),
        system_program: solana_sdk::system_program::ID,
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    context
        .banks_client
        .process_instruction(
            &init_instruction.accounts(init_accounts),
            vec![&context.payer],
        )
        .await
        .unwrap();
    
    // Update roles
    let update_instruction = sss_token::instruction::UpdateRoles {
        new_blacklister: new_blacklister_keypair.pubkey(),
        new_pauser: new_pauser_keypair.pubkey(),
        new_seizer: new_seizer_keypair.pubkey(),
    };
    let update_accounts = sss_token::accounts::UpdateRoles {
        config: config_pda,
        mint: mint_pubkey,
        master_authority: context.payer.pubkey(),
    };
    
    context
        .banks_client
        .process_instruction(
            &update_instruction.accounts(update_accounts),
            vec![&context.payer],
        )
        .await
        .unwrap();
    
    // Verify roles updated
    let config_account = context
        .banks_client
        .get_account(config_pda)
        .await
        .unwrap()
        .unwrap();
    
    let config = sss_token::state::StablecoinConfig::try_deserialize(&config_account.data).unwrap();
    assert_eq!(config.blacklister, new_blacklister_keypair.pubkey());
    assert_eq!(config.pauser, new_pauser_keypair.pubkey());
    assert_eq!(config.seizer, new_seizer_keypair.pubkey());
}