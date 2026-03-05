use anchor_lang::prelude::*;
use anchor_lang::solana_program;
use sss_token::{
    state::{StablecoinConfig, MinterInfo, BlacklistEntry},
    instruction::{Initialize, AddMinter, RemoveMinter, Pause, Unpause, AddToBlacklist, RemoveFromBlacklist, TransferAuthority, UpdateRoles},
    accounts::{Initialize as InitAccounts, AddMinter as AddMinterAccounts, RemoveMinter as RemoveMinterAccounts, Pause as PauseAccounts, Unpause as UnpauseAccounts, AddToBlacklist as AddToBlacklistAccounts, RemoveFromBlacklist as RemoveFromBlacklistAccounts, TransferAuthority as TransferAuthorityAccounts, UpdateRoles as UpdateRolesAccounts},
    program::SssToken,
};

// Program ID
const SSS_TOKEN_PROGRAM_ID: &str = "Hf1s4EvjS79S6kcHdKhaZHVQsnsjqMbJgBEFZfaGDPmw";
const TOKEN_2022_PROGRAM_ID: &str = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

#[test]
fn test_initialize_sss1_minimal_stablecoin() {
    let mut context = ProgramTest::new(
        "sss_token",
        SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
        processor!(SssToken::process),
    )
    .start_with_context();

    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    
    // Calculate config PDA
    let (config_pda, _config_bump) = Pubkey::find_program_address(
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
    
    let mut transaction = Transaction::new_with_payer(
        &[SssToken::accounts(InitAccounts {
            config: config_pda,
            mint: mint_pubkey,
            authority: context.payer.pubkey(),
            system_program: solana_program::system_program::id(),
            token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
        })
        .instruction(Initialize {
            name: name.to_string(),
            symbol: symbol.to_string(),
            uri: uri.to_string(),
            decimals,
            enable_permanent_delegate,
            enable_transfer_hook,
            default_account_frozen,
        })],
        Some(&context.payer.pubkey()),
    );
    
    transaction.sign(&[&context.payer, &mint_keypair]);
    
    context
        .banks_client
        .process_transaction(transaction)
        .unwrap();
    
    // Verify config account
    let config_account = context
        .banks_client
        .get_account(config_pda)
        .unwrap()
        .unwrap();
    
    let config = StablecoinConfig::try_deserialize(&config_account.data).unwrap();
    
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

#[test]
fn test_initialize_sss2_compliant_stablecoin() {
    let mut context = ProgramTest::new(
        "sss_token",
        SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
        processor!(SssToken::process),
    )
    .start_with_context();

    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    
    let (config_pda, _config_bump) = Pubkey::find_program_address(
        &[b"config", mint_pubkey.as_ref()],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    // Initialize with SSS-2 preset (compliant)
    let mut transaction = Transaction::new_with_payer(
        &[SssToken::accounts(InitAccounts {
            config: config_pda,
            mint: mint_pubkey,
            authority: context.payer.pubkey(),
            system_program: solana_program::system_program::id(),
            token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
        })
        .instruction(Initialize {
            name: "Compliant Token".to_string(),
            symbol: "COMP".to_string(),
            uri: "https://example.com/compliant.json".to_string(),
            decimals: 6,
            enable_permanent_delegate: true,
            enable_transfer_hook: true,
            default_account_frozen: false,
        })],
        Some(&context.payer.pubkey()),
    );
    
    transaction.sign(&[&context.payer, &mint_keypair]);
    
    context
        .banks_client
        .process_transaction(transaction)
        .unwrap();
    
    // Verify config
    let config_account = context
        .banks_client
        .get_account(config_pda)
        .unwrap()
        .unwrap();
    
    let config = StablecoinConfig::try_deserialize(&config_account.data).unwrap();
    
    assert_eq!(config.enable_permanent_delegate, true);
    assert_eq!(config.enable_transfer_hook, true);
}

#[test]
fn test_fail_to_initialize_twice() {
    let mut context = ProgramTest::new(
        "sss_token",
        SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
        processor!(SssToken::process),
    )
    .start_with_context();

    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    
    let (config_pda, _config_bump) = Pubkey::find_program_address(
        &[b"config", mint_pubkey.as_ref()],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    let init_accounts = InitAccounts {
        config: config_pda,
        mint: mint_pubkey,
        authority: context.payer.pubkey(),
        system_program: solana_program::system_program::id(),
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    let init_ix = Initialize {
        name: "Test Token".to_string(),
        symbol: "TEST".to_string(),
        uri: "https://example.com/metadata.json".to_string(),
        decimals: 6,
        enable_permanent_delegate: false,
        enable_transfer_hook: false,
        default_account_frozen: false,
    };
    
    // First initialization should succeed
    let mut transaction = Transaction::new_with_payer(
        &[SssToken::accounts(init_accounts.clone()).instruction(init_ix.clone())],
        Some(&context.payer.pubkey()),
    );
    transaction.sign(&[&context.payer, &mint_keypair]);
    context
        .banks_client
        .process_transaction(transaction)
        .unwrap();
    
    // Second initialization should fail
    let mut transaction2 = Transaction::new_with_payer(
        &[SssToken::accounts(init_accounts).instruction(init_ix)],
        Some(&context.payer.pubkey()),
    );
    transaction2.sign(&[&context.payer, &mint_keypair]);
    
    let result = context
        .banks_client
        .process_transaction(transaction2);
    
    assert!(result.is_err());
}

#[test]
fn test_add_minter() {
    let mut context = ProgramTest::new(
        "sss_token",
        SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
        processor!(SssToken::process),
    )
    .start_with_context();
    
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
    
    // Initialize config first
    let init_accounts = InitAccounts {
        config: config_pda,
        mint: mint_pubkey,
        authority: context.payer.pubkey(),
        system_program: solana_program::system_program::id(),
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    let init_ix = Initialize {
        name: "Test Token".to_string(),
        symbol: "TEST".to_string(),
        uri: "https://example.com/metadata.json".to_string(),
        decimals: 6,
        enable_permanent_delegate: false,
        enable_transfer_hook: false,
        default_account_frozen: false,
    };
    
    let mut init_tx = Transaction::new_with_payer(
        &[SssToken::accounts(init_accounts).instruction(init_ix)],
        Some(&context.payer.pubkey()),
    );
    init_tx.sign(&[&context.payer, &mint_keypair]);
    context
        .banks_client
        .process_transaction(init_tx)
        .unwrap();
    
    // Add minter
    let add_minter_accounts = AddMinterAccounts {
        config: config_pda,
        mint: mint_pubkey,
        minter: minter_keypair.pubkey(),
        minter_info: minter_info_pda,
        master_authority: context.payer.pubkey(),
        system_program: solana_program::system_program::id(),
    };
    
    let add_minter_ix = AddMinter { quota: 1_000_000 };
    
    let mut add_tx = Transaction::new_with_payer(
        &[SssToken::accounts(add_minter_accounts).instruction(add_minter_ix)],
        Some(&context.payer.pubkey()),
    );
    add_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(add_tx)
        .unwrap();
    
    // Verify minter info
    let minter_info_account = context
        .banks_client
        .get_account(minter_info_pda)
        .unwrap()
        .unwrap();
    
    let minter_info = MinterInfo::try_deserialize(&minter_info_account.data).unwrap();
    
    assert_eq!(minter_info.authority, minter_keypair.pubkey());
    assert_eq!(minter_info.quota, 1_000_000);
    assert_eq!(minter_info.minted, 0);
}

#[test]
fn test_remove_minter() {
    let mut context = ProgramTest::new(
        "sss_token",
        SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
        processor!(SssToken::process),
    )
    .start_with_context();
    
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
    let init_accounts = InitAccounts {
        config: config_pda,
        mint: mint_pubkey,
        authority: context.payer.pubkey(),
        system_program: solana_program::system_program::id(),
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    let init_ix = Initialize {
        name: "Test Token".to_string(),
        symbol: "TEST".to_string(),
        uri: "https://example.com/metadata.json".to_string(),
        decimals: 6,
        enable_permanent_delegate: false,
        enable_transfer_hook: false,
        default_account_frozen: false,
    };
    
    let mut init_tx = Transaction::new_with_payer(
        &[SssToken::accounts(init_accounts).instruction(init_ix)],
        Some(&context.payer.pubkey()),
    );
    init_tx.sign(&[&context.payer, &mint_keypair]);
    context
        .banks_client
        .process_transaction(init_tx)
        .unwrap();
    
    let add_minter_accounts = AddMinterAccounts {
        config: config_pda,
        mint: mint_pubkey,
        minter: minter_keypair.pubkey(),
        minter_info: minter_info_pda,
        master_authority: context.payer.pubkey(),
        system_program: solana_program::system_program::id(),
    };
    
    let add_minter_ix = AddMinter { quota: 1_000_000 };
    
    let mut add_tx = Transaction::new_with_payer(
        &[SssToken::accounts(add_minter_accounts).instruction(add_minter_ix)],
        Some(&context.payer.pubkey()),
    );
    add_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(add_tx)
        .unwrap();
    
    // Remove minter
    let remove_minter_accounts = RemoveMinterAccounts {
        config: config_pda,
        mint: mint_pubkey,
        minter: minter_keypair.pubkey(),
        minter_info: minter_info_pda,
        master_authority: context.payer.pubkey(),
    };
    
    let remove_minter_ix = RemoveMinter {};
    
    let mut remove_tx = Transaction::new_with_payer(
        &[SssToken::accounts(remove_minter_accounts).instruction(remove_minter_ix)],
        Some(&context.payer.pubkey()),
    );
    remove_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(remove_tx)
        .unwrap();
    
    // Verify quota is set to 0
    let minter_info_account = context
        .banks_client
        .get_account(minter_info_pda)
        .unwrap()
        .unwrap();
    
    let minter_info = MinterInfo::try_deserialize(&minter_info_account.data).unwrap();
    assert_eq!(minter_info.quota, 0);
}

#[test]
fn test_pause_and_unpause() {
    let mut context = ProgramTest::new(
        "sss_token",
        SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
        processor!(SssToken::process),
    )
    .start_with_context();
    
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    
    let (config_pda, _config_bump) = Pubkey::find_program_address(
        &[b"config", mint_pubkey.as_ref()],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    // Initialize config
    let init_accounts = InitAccounts {
        config: config_pda,
        mint: mint_pubkey,
        authority: context.payer.pubkey(),
        system_program: solana_program::system_program::id(),
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    let init_ix = Initialize {
        name: "Test Token".to_string(),
        symbol: "TEST".to_string(),
        uri: "https://example.com/metadata.json".to_string(),
        decimals: 6,
        enable_permanent_delegate: false,
        enable_transfer_hook: false,
        default_account_frozen: false,
    };
    
    let mut init_tx = Transaction::new_with_payer(
        &[SssToken::accounts(init_accounts).instruction(init_ix)],
        Some(&context.payer.pubkey()),
    );
    init_tx.sign(&[&context.payer, &mint_keypair]);
    context
        .banks_client
        .process_transaction(init_tx)
        .unwrap();
    
    // Pause
    let pause_accounts = PauseAccounts {
        config: config_pda,
        mint: mint_pubkey,
        pauser: context.payer.pubkey(),
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    let pause_ix = Pause {};
    
    let mut pause_tx = Transaction::new_with_payer(
        &[SssToken::accounts(pause_accounts).instruction(pause_ix)],
        Some(&context.payer.pubkey()),
    );
    pause_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(pause_tx)
        .unwrap();
    
    // Verify paused
    let config_account = context
        .banks_client
        .get_account(config_pda)
        .unwrap()
        .unwrap();
    
    let config = StablecoinConfig::try_deserialize(&config_account.data).unwrap();
    assert_eq!(config.paused, true);
    
    // Unpause
    let unpause_accounts = UnpauseAccounts {
        config: config_pda,
        mint: mint_pubkey,
        pauser: context.payer.pubkey(),
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    let unpause_ix = Unpause {};
    
    let mut unpause_tx = Transaction::new_with_payer(
        &[SssToken::accounts(unpause_accounts).instruction(unpause_ix)],
        Some(&context.payer.pubkey()),
    );
    unpause_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(unpause_tx)
        .unwrap();
    
    // Verify unpaused
    let config_account = context
        .banks_client
        .get_account(config_pda)
        .unwrap()
        .unwrap();
    
    let config = StablecoinConfig::try_deserialize(&config_account.data).unwrap();
    assert_eq!(config.paused, false);
}

#[test]
fn test_blacklist_operations_sss2() {
    let mut context = ProgramTest::new(
        "sss_token",
        SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
        processor!(SssToken::process),
    )
    .start_with_context();
    
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
    let init_accounts = InitAccounts {
        config: config_pda,
        mint: mint_pubkey,
        authority: context.payer.pubkey(),
        system_program: solana_program::system_program::id(),
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    let init_ix = Initialize {
        name: "Compliant Token".to_string(),
        symbol: "COMP".to_string(),
        uri: "https://example.com/compliant.json".to_string(),
        decimals: 6,
        enable_permanent_delegate: true,
        enable_transfer_hook: true,
        default_account_frozen: false,
    };
    
    let mut init_tx = Transaction::new_with_payer(
        &[SssToken::accounts(init_accounts).instruction(init_ix)],
        Some(&context.payer.pubkey()),
    );
    init_tx.sign(&[&context.payer, &mint_keypair]);
    context
        .banks_client
        .process_transaction(init_tx)
        .unwrap();
    
    // Add to blacklist
    let add_bl_accounts = AddToBlacklistAccounts {
        config: config_pda,
        mint: mint_pubkey,
        blacklister: context.payer.pubkey(),
        user: user_keypair.pubkey(),
        blacklist_entry: blacklist_entry_pda,
        system_program: solana_program::system_program::id(),
    };
    
    let add_bl_ix = AddToBlacklist {
        reason: "Suspicious activity".to_string(),
    };
    
    let mut add_tx = Transaction::new_with_payer(
        &[SssToken::accounts(add_bl_accounts).instruction(add_bl_ix)],
        Some(&context.payer.pubkey()),
    );
    add_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(add_tx)
        .unwrap();
    
    // Verify blacklist entry
    let bl_account = context
        .banks_client
        .get_account(blacklist_entry_pda)
        .unwrap()
        .unwrap();
    
    let bl_entry = BlacklistEntry::try_deserialize(&bl_account.data).unwrap();
    assert_eq!(bl_entry.user, user_keypair.pubkey());
    assert_eq!(bl_entry.reason, "Suspicious activity");
    assert!(bl_entry.timestamp > 0);
    
    // Remove from blacklist
    let remove_bl_accounts = RemoveFromBlacklistAccounts {
        config: config_pda,
        mint: mint_pubkey,
        blacklister: context.payer.pubkey(),
        user: user_keypair.pubkey(),
        blacklist_entry: blacklist_entry_pda,
        system_program: solana_program::system_program::id(),
    };
    
    let remove_bl_ix = RemoveFromBlacklist {};
    
    let mut remove_tx = Transaction::new_with_payer(
        &[SssToken::accounts(remove_bl_accounts).instruction(remove_bl_ix)],
        Some(&context.payer.pubkey()),
    );
    remove_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(remove_tx)
        .unwrap();
    
    // Verify account is closed
    let result = context
        .banks_client
        .get_account(blacklist_entry_pda);
    
    assert!(result.is_err());
}

#[test]
fn test_transfer_authority() {
    let mut context = ProgramTest::new(
        "sss_token",
        SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
        processor!(SssToken::process),
    )
    .start_with_context();
    
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let new_authority_keypair = Keypair::new();
    
    let (config_pda, _config_bump) = Pubkey::find_program_address(
        &[b"config", mint_pubkey.as_ref()],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    // Initialize config
    let init_accounts = InitAccounts {
        config: config_pda,
        mint: mint_pubkey,
        authority: context.payer.pubkey(),
        system_program: solana_program::system_program::id(),
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    let init_ix = Initialize {
        name: "Test Token".to_string(),
        symbol: "TEST".to_string(),
        uri: "https://example.com/metadata.json".to_string(),
        decimals: 6,
        enable_permanent_delegate: false,
        enable_transfer_hook: false,
        default_account_frozen: false,
    };
    
    let mut init_tx = Transaction::new_with_payer(
        &[SssToken::accounts(init_accounts).instruction(init_ix)],
        Some(&context.payer.pubkey()),
    );
    init_tx.sign(&[&context.payer, &mint_keypair]);
    context
        .banks_client
        .process_transaction(init_tx)
        .unwrap();
    
    // Transfer authority
    let transfer_accounts = TransferAuthorityAccounts {
        config: config_pda,
        mint: mint_pubkey,
        master_authority: context.payer.pubkey(),
    };
    
    let transfer_ix = TransferAuthority {
        new_master_authority: new_authority_keypair.pubkey(),
    };
    
    let mut transfer_tx = Transaction::new_with_payer(
        &[SssToken::accounts(transfer_accounts).instruction(transfer_ix)],
        Some(&context.payer.pubkey()),
    );
    transfer_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(transfer_tx)
        .unwrap();
    
    // Verify authority changed
    let config_account = context
        .banks_client
        .get_account(config_pda)
        .unwrap()
        .unwrap();
    
    let config = StablecoinConfig::try_deserialize(&config_account.data).unwrap();
    assert_eq!(config.master_authority, new_authority_keypair.pubkey());
}

#[test]
fn test_update_roles() {
    let mut context = ProgramTest::new(
        "sss_token",
        SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
        processor!(SssToken::process),
    )
    .start_with_context();
    
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
    let init_accounts = InitAccounts {
        config: config_pda,
        mint: mint_pubkey,
        authority: context.payer.pubkey(),
        system_program: solana_program::system_program::id(),
        token_program: TOKEN_2022_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    };
    
    let init_ix = Initialize {
        name: "Test Token".to_string(),
        symbol: "TEST".to_string(),
        uri: "https://example.com/metadata.json".to_string(),
        decimals: 6,
        enable_permanent_delegate: true,
        enable_transfer_hook: true,
        default_account_frozen: false,
    };
    
    let mut init_tx = Transaction::new_with_payer(
        &[SssToken::accounts(init_accounts).instruction(init_ix)],
        Some(&context.payer.pubkey()),
    );
    init_tx.sign(&[&context.payer, &mint_keypair]);
    context
        .banks_client
        .process_transaction(init_tx)
        .unwrap();
    
    // Update roles
    let update_accounts = UpdateRolesAccounts {
        config: config_pda,
        mint: mint_pubkey,
        master_authority: context.payer.pubkey(),
    };
    
    let update_ix = UpdateRoles {
        new_blacklister: new_blacklister_keypair.pubkey(),
        new_pauser: new_pauser_keypair.pubkey(),
        new_seizer: new_seizer_keypair.pubkey(),
    };
    
    let mut update_tx = Transaction::new_with_payer(
        &[SssToken::accounts(update_accounts).instruction(update_ix)],
        Some(&context.payer.pubkey()),
    );
    update_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(update_tx)
        .unwrap();
    
    // Verify roles updated
    let config_account = context
        .banks_client
        .get_account(config_pda)
        .unwrap()
        .unwrap();
    
    let config = StablecoinConfig::try_deserialize(&config_account.data).unwrap();
    assert_eq!(config.blacklister, new_blacklister_keypair.pubkey());
    assert_eq!(config.pauser, new_pauser_keypair.pubkey());
    assert_eq!(config.seizer, new_seizer_keypair.pubkey());
}