use anchor_lang::prelude::*;
use anchor_lang::solana_program::{system_program, sysvar};
use sss_token::program::SssToken;
use sss_token::{StablecoinConfig, MinterInfo, BlacklistEntry};
use solana_program_test::*;
use solana_sdk::{
    signature::{Keypair, Signer},
    transaction::Transaction,
};

// Program ID
const SSS_TOKEN_PROGRAM_ID: &str = "Hf1s4EvjS79S6kcHdKhaZHVQsnsjqMbJgBEFZfaGDPmw";

#[tokio::test]
async fn test_initialize_sss1_minimal_stablecoin() {
    let mut context = ProgramTest::new(
        "sss_token",
        SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
        processor!(SssToken::process),
    )
    .start_with_context()
    .await;

    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let authority = context.payer.pubkey();
    
    // Calculate config PDA
    let (config_pda, config_bump) = Pubkey::find_program_address(
        &[b"config", mint_pubkey.as_ref()],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    // Initialize with SSS-1 preset (minimal)
    let mut transaction = Transaction::new_with_payer(
        &[anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
            accounts: vec![
                anchor_lang::solana_program::instruction::AccountMeta::new(config_pda, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(mint_pubkey, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(authority, true),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(system_program::id(), false),
            ],
            data: anchor_lang::InstructionData::data(&(
                0u8, // initialize instruction
                "Test Token".to_string(),
                "TEST".to_string(),
                "https://example.com/metadata.json".to_string(),
                6u8,
                false,
                false,
                false,
            )),
        }],
        Some(&authority),
    );
    
    transaction.sign(&[&context.payer]);
    
    context
        .banks_client
        .process_transaction(transaction)
        .await
        .unwrap();
    
    // Verify config account
    let config_account = context
        .banks_client
        .get_account(config_pda)
        .await
        .unwrap()
        .unwrap();
    
    let config = StablecoinConfig::try_deserialize(&mut config_account.data.as_slice()).unwrap();
    
    assert_eq!(config.name, "Test Token");
    assert_eq!(config.symbol, "TEST");
    assert_eq!(config.uri, "https://example.com/metadata.json");
    assert_eq!(config.decimals, 6);
    assert_eq!(config.paused, false);
    assert_eq!(config.enable_permanent_delegate, false);
    assert_eq!(config.enable_transfer_hook, false);
    assert_eq!(config.default_account_frozen, false);
    assert_eq!(config.master_authority, authority);
}

#[tokio::test]
async fn test_add_minter() {
    let mut context = ProgramTest::new(
        "sss_token",
        SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
        processor!(SssToken::process),
    )
    .start_with_context()
    .await;
    
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let authority = context.payer.pubkey();
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
    let mut init_tx = Transaction::new_with_payer(
        &[anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
            accounts: vec![
                anchor_lang::solana_program::instruction::AccountMeta::new(config_pda, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(mint_pubkey, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(authority, true),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(system_program::id(), false),
            ],
            data: anchor_lang::InstructionData::data(&(
                0u8, // initialize
                "Test Token".to_string(),
                "TEST".to_string(),
                "https://example.com/metadata.json".to_string(),
                6u8,
                false,
                false,
                false,
            )),
        }],
        Some(&authority),
    );
    init_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(init_tx)
        .await
        .unwrap();
    
    // Add minter
    let mut add_tx = Transaction::new_with_payer(
        &[anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
            accounts: vec![
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(config_pda, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(mint_pubkey, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(minter_keypair.pubkey(), false),
                anchor_lang::solana_program::instruction::AccountMeta::new(minter_info_pda, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(authority, true),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(system_program::id(), false),
            ],
            data: anchor_lang::InstructionData::data(&(6u8, 1_000_000u64)), // add_minter instruction index, quota
        }],
        Some(&authority),
    );
    add_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(add_tx)
        .await
        .unwrap();
    
    // Verify minter info
    let minter_info_account = context
        .banks_client
        .get_account(minter_info_pda)
        .await
        .unwrap()
        .unwrap();
    
    let minter_info = MinterInfo::try_deserialize(&mut minter_info_account.data.as_slice()).unwrap();
    
    assert_eq!(minter_info.authority, minter_keypair.pubkey());
    assert_eq!(minter_info.quota, 1_000_000);
    assert_eq!(minter_info.minted, 0);
}

#[tokio::test]
async fn test_remove_minter() {
    let mut context = ProgramTest::new(
        "sss_token",
        SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
        processor!(SssToken::process),
    )
    .start_with_context()
    .await;
    
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let authority = context.payer.pubkey();
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
    
    // Initialize config
    let mut init_tx = Transaction::new_with_payer(
        &[anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
            accounts: vec![
                anchor_lang::solana_program::instruction::AccountMeta::new(config_pda, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(mint_pubkey, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(authority, true),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(system_program::id(), false),
            ],
            data: anchor_lang::InstructionData::data(&(
                0u8,
                "Test Token".to_string(),
                "TEST".to_string(),
                "https://example.com/metadata.json".to_string(),
                6u8,
                false,
                false,
                false,
            )),
        }],
        Some(&authority),
    );
    init_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(init_tx)
        .await
        .unwrap();
    
    // Add minter
    let mut add_tx = Transaction::new_with_payer(
        &[anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
            accounts: vec![
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(config_pda, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(mint_pubkey, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(minter_keypair.pubkey(), false),
                anchor_lang::solana_program::instruction::AccountMeta::new(minter_info_pda, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(authority, true),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(system_program::id(), false),
            ],
            data: anchor_lang::InstructionData::data(&(6u8, 1_000_000u64)),
        }],
        Some(&authority),
    );
    add_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(add_tx)
        .await
        .unwrap();
    
    // Remove minter
    let mut remove_tx = Transaction::new_with_payer(
        &[anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
            accounts: vec![
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(config_pda, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(mint_pubkey, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(minter_keypair.pubkey(), false),
                anchor_lang::solana_program::instruction::AccountMeta::new(minter_info_pda, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(authority, true),
            ],
            data: anchor_lang::InstructionData::data(&(7u8)), // remove_minter instruction index
        }],
        Some(&authority),
    );
    remove_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(remove_tx)
        .await
        .unwrap();
    
    // Verify quota is set to 0
    let minter_info_account = context
        .banks_client
        .get_account(minter_info_pda)
        .await
        .unwrap()
        .unwrap();
    
    let minter_info = MinterInfo::try_deserialize(&mut minter_info_account.data.as_slice()).unwrap();
    assert_eq!(minter_info.quota, 0);
}

#[tokio::test]
async fn test_pause_and_unpause() {
    let mut context = ProgramTest::new(
        "sss_token",
        SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
        processor!(SssToken::process),
    )
    .start_with_context()
    .await;
    
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let authority = context.payer.pubkey();
    
    let (config_pda, config_bump) = Pubkey::find_program_address(
        &[b"config", mint_pubkey.as_ref()],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    // Initialize config
    let mut init_tx = Transaction::new_with_payer(
        &[anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
            accounts: vec![
                anchor_lang::solana_program::instruction::AccountMeta::new(config_pda, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(mint_pubkey, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(authority, true),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(system_program::id(), false),
            ],
            data: anchor_lang::InstructionData::data(&(
                0u8,
                "Test Token".to_string(),
                "TEST".to_string(),
                "https://example.com/metadata.json".to_string(),
                6u8,
                false,
                false,
                false,
            )),
        }],
        Some(&authority),
    );
    init_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(init_tx)
        .await
        .unwrap();
    
    // Pause
    let mut pause_tx = Transaction::new_with_payer(
        &[anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
            accounts: vec![
                anchor_lang::solana_program::instruction::AccountMeta::new(config_pda, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(mint_pubkey, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(authority, true),
            ],
            data: anchor_lang::InstructionData::data(&(3u8)), // pause instruction index
        }],
        Some(&authority),
    );
    pause_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(pause_tx)
        .await
        .unwrap();
    
    // Verify paused
    let config_account = context
        .banks_client
        .get_account(config_pda)
        .await
        .unwrap()
        .unwrap();
    
    let config = StablecoinConfig::try_deserialize(&mut config_account.data.as_slice()).unwrap();
    assert_eq!(config.paused, true);
    
    // Unpause
    let mut unpause_tx = Transaction::new_with_payer(
        &[anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
            accounts: vec![
                anchor_lang::solana_program::instruction::AccountMeta::new(config_pda, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(mint_pubkey, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(authority, true),
            ],
            data: anchor_lang::InstructionData::data(&(4u8)), // unpause instruction index
        }],
        Some(&authority),
    );
    unpause_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(unpause_tx)
        .await
        .unwrap();
    
    // Verify unpaused
    let config_account = context
        .banks_client
        .get_account(config_pda)
        .await
        .unwrap()
        .unwrap();
    
    let config = StablecoinConfig::try_deserialize(&mut config_account.data.as_slice()).unwrap();
    assert_eq!(config.paused, false);
}

#[tokio::test]
async fn test_transfer_authority() {
    let mut context = ProgramTest::new(
        "sss_token",
        SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
        processor!(SssToken::process),
    )
    .start_with_context()
    .await;
    
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let authority = context.payer.pubkey();
    let new_authority_keypair = Keypair::new();
    
    let (config_pda, config_bump) = Pubkey::find_program_address(
        &[b"config", mint_pubkey.as_ref()],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    // Initialize config
    let mut init_tx = Transaction::new_with_payer(
        &[anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
            accounts: vec![
                anchor_lang::solana_program::instruction::AccountMeta::new(config_pda, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(mint_pubkey, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(authority, true),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(system_program::id(), false),
            ],
            data: anchor_lang::InstructionData::data(&(
                0u8,
                "Test Token".to_string(),
                "TEST".to_string(),
                "https://example.com/metadata.json".to_string(),
                6u8,
                false,
                false,
                false,
            )),
        }],
        Some(&authority),
    );
    init_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(init_tx)
        .await
        .unwrap();
    
    // Transfer authority
    let mut transfer_tx = Transaction::new_with_payer(
        &[anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
            accounts: vec![
                anchor_lang::solana_program::instruction::AccountMeta::new(config_pda, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(mint_pubkey, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(authority, true),
            ],
            data: anchor_lang::InstructionData::data(&(12u8, new_authority_keypair.pubkey())), // transfer_authority instruction index
        }],
        Some(&authority),
    );
    transfer_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(transfer_tx)
        .await
        .unwrap();
    
    // Verify authority changed
    let config_account = context
        .banks_client
        .get_account(config_pda)
        .await
        .unwrap()
        .unwrap();
    
    let config = StablecoinConfig::try_deserialize(&mut config_account.data.as_slice()).unwrap();
    assert_eq!(config.master_authority, new_authority_keypair.pubkey());
}

#[tokio::test]
async fn test_update_roles() {
    let mut context = ProgramTest::new(
        "sss_token",
        SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
        processor!(SssToken::process),
    )
    .start_with_context()
    .await;
    
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let authority = context.payer.pubkey();
    let new_blacklister_keypair = Keypair::new();
    let new_pauser_keypair = Keypair::new();
    let new_seizer_keypair = Keypair::new();
    
    let (config_pda, config_bump) = Pubkey::find_program_address(
        &[b"config", mint_pubkey.as_ref()],
        &SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
    );
    
    // Initialize config
    let mut init_tx = Transaction::new_with_payer(
        &[anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
            accounts: vec![
                anchor_lang::solana_program::instruction::AccountMeta::new(config_pda, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(mint_pubkey, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(authority, true),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(system_program::id(), false),
            ],
            data: anchor_lang::InstructionData::data(&(
                0u8,
                "Test Token".to_string(),
                "TEST".to_string(),
                "https://example.com/metadata.json".to_string(),
                6u8,
                true,
                true,
                false,
            )),
        }],
        Some(&authority),
    );
    init_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(init_tx)
        .await
        .unwrap();
    
    // Update roles
    let mut update_tx = Transaction::new_with_payer(
        &[anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_TOKEN_PROGRAM_ID.parse::<Pubkey>().unwrap(),
            accounts: vec![
                anchor_lang::solana_program::instruction::AccountMeta::new(config_pda, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(mint_pubkey, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(authority, true),
            ],
            data: anchor_lang::InstructionData::data(&(10u8, new_blacklister_keypair.pubkey(), new_pauser_keypair.pubkey(), new_seizer_keypair.pubkey())), // update_roles instruction index
        }],
        Some(&authority),
    );
    update_tx.sign(&[&context.payer]);
    context
        .banks_client
        .process_transaction(update_tx)
        .await
        .unwrap();
    
    // Verify roles updated
    let config_account = context
        .banks_client
        .get_account(config_pda)
        .await
        .unwrap()
        .unwrap();
    
    let config = StablecoinConfig::try_deserialize(&mut config_account.data.as_slice()).unwrap();
    assert_eq!(config.blacklister, new_blacklister_keypair.pubkey());
    assert_eq!(config.pauser, new_pauser_keypair.pubkey());
    assert_eq!(config.seizer, new_seizer_keypair.pubkey());
}