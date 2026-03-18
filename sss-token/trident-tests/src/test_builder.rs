//! Fuzz Test Builder for SSS Token
//!
//! This module provides utilities for building fuzz tests with
//! arbitrary input generation.

use solana_sdk::{
    pubkey::Pubkey,
    signature::{Keypair, Signer},
};
use arbitrary::Unstructured;

/// Builder for creating fuzz test scenarios
pub struct FuzzTestBuilder {
    /// Test configuration
    pub config: FuzzTestConfig,
    /// Accounts involved in the test
    pub accounts: Vec<TestAccount>,
    /// Operations to perform
    pub operations: Vec<FuzzOperation>,
}

/// Configuration for fuzz tests
#[derive(Clone, Debug)]
pub struct FuzzTestConfig {
    /// Number of iterations to run
    pub iterations: usize,
    /// Maximum accounts to create
    pub max_accounts: usize,
    /// Maximum operations per iteration
    pub max_operations: usize,
    /// Enable verbose logging
    pub verbose: bool,
}

impl Default for FuzzTestConfig {
    fn default() -> Self {
        Self {
            iterations: 100,
            max_accounts: 10,
            max_operations: 50,
            verbose: false,
        }
    }
}

/// Represents a test account
#[derive(Debug)]
pub struct TestAccount {
    pub pubkey: Pubkey,
    pub keypair: Keypair,
    pub role: AccountRole,
    pub is_blacklisted: bool,
    pub token_balance: u64,
}

/// Roles that accounts can have
#[derive(Clone, Debug, PartialEq)]
pub enum AccountRole {
    MasterAuthority,
    Minter,
    Pauser,
    Blacklister,
    Seizer,
    RegularUser,
}

/// Operations that can be fuzzed
#[derive(Clone, Debug)]
pub enum FuzzOperation {
    Initialize {
        name: String,
        symbol: String,
        decimals: u8,
        enable_permanent_delegate: bool,
        enable_transfer_hook: bool,
    },
    AddMinter {
        minter: Pubkey,
        quota: u64,
    },
    RemoveMinter {
        minter: Pubkey,
    },
    UpdateMinterQuota {
        minter: Pubkey,
        new_quota: u64,
    },
    MintTokens {
        minter: Pubkey,
        amount: u64,
    },
    BurnTokens {
        amount: u64,
    },
    Pause,
    Unpause,
    AddToBlacklist {
        user: Pubkey,
        reason: String,
    },
    RemoveFromBlacklist {
        user: Pubkey,
    },
    FreezeAccount {
        account: Pubkey,
    },
    ThawAccount {
        account: Pubkey,
    },
    SeizeTokens {
        source: Pubkey,
        destination: Pubkey,
        amount: u64,
    },
    TransferAuthority {
        new_authority: Pubkey,
    },
    UpdateRoles {
        blacklister: Pubkey,
        pauser: Pubkey,
        seizer: Pubkey,
    },
}

/// State tracker for fuzz tests
#[derive(Clone, Debug, Default)]
pub struct FuzzStateTracker {
    pub is_initialized: bool,
    pub is_paused: bool,
    pub blacklisted_addresses: Vec<Pubkey>,
    pub frozen_accounts: Vec<Pubkey>,
    pub minter_quotas: Vec<(Pubkey, u64, u64)>, // (minter, quota, minted)
    pub permanent_delegate_enabled: bool,
    pub transfer_hook_enabled: bool,
}

impl FuzzStateTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Check if an address is blacklisted
    pub fn is_blacklisted(&self, address: &Pubkey) -> bool {
        self.blacklisted_addresses.contains(address)
    }

    /// Check if an account is frozen
    pub fn is_frozen(&self, account: &Pubkey) -> bool {
        self.frozen_accounts.contains(account)
    }

    /// Get minter info
    pub fn get_minter_info(&self, minter: &Pubkey) -> Option<(u64, u64)> {
        self.minter_quotas
            .iter()
            .find(|(pk, _, _)| pk == minter)
            .map(|(_, quota, minted)| (*quota, *minted))
    }

    /// Update minter minted amount
    pub fn update_minter_minted(&mut self, minter: &Pubkey, additional: u64) {
        if let Some(entry) = self.minter_quotas.iter_mut().find(|(pk, _, _)| pk == minter) {
            entry.2 += additional;
        }
    }
}

/// Generate a random string of specified max length
fn generate_string(u: &mut Unstructured, max_len: usize) -> arbitrary::Result<String> {
    let len = u.int_in_range(1..=max_len)?;
    let mut chars = Vec::with_capacity(len);
    for _ in 0..len {
        let c = u.int_in_range(b'a'..=b'z')? as char;
        chars.push(c);
    }
    Ok(chars.into_iter().collect())
}

impl FuzzTestBuilder {
    /// Create a new fuzz test builder with default configuration
    pub fn new() -> Self {
        Self {
            config: FuzzTestConfig::default(),
            accounts: Vec::new(),
            operations: Vec::new(),
        }
    }

    /// Set the number of iterations
    pub fn iterations(mut self, iterations: usize) -> Self {
        self.config.iterations = iterations;
        self
    }

    /// Set the maximum number of accounts
    pub fn max_accounts(mut self, max: usize) -> Self {
        self.config.max_accounts = max;
        self
    }

    /// Set the maximum number of operations per iteration
    pub fn max_operations(mut self, max: usize) -> Self {
        self.config.max_operations = max;
        self
    }

    /// Enable verbose logging
    pub fn verbose(mut self, verbose: bool) -> Self {
        self.config.verbose = verbose;
        self
    }

    /// Add a test account
    pub fn add_account(mut self, role: AccountRole) -> Self {
        let keypair = Keypair::new();
        self.accounts.push(TestAccount {
            pubkey: keypair.pubkey(),
            keypair,
            role,
            is_blacklisted: false,
            token_balance: 0,
        });
        self
    }

    /// Add an operation to the test
    pub fn add_operation(mut self, operation: FuzzOperation) -> Self {
        self.operations.push(operation);
        self
    }

    /// Generate random operations from unstructured data
    pub fn generate_operations(&mut self, u: &mut Unstructured) -> arbitrary::Result<()> {
        let num_ops = u.int_in_range(1..=self.config.max_operations)?;
        
        for _ in 0..num_ops {
            let op_type = u.int_in_range(0..=14)?;
            
            let operation = match op_type {
                0 => FuzzOperation::Initialize {
                    name: generate_string(u, 10)?,
                    symbol: generate_string(u, 5)?,
                    decimals: u.int_in_range(0..=18)?,
                    enable_permanent_delegate: u.arbitrary()?,
                    enable_transfer_hook: u.arbitrary()?,
                },
                1 => FuzzOperation::AddMinter {
                    minter: Pubkey::new_unique(),
                    quota: u.arbitrary()?,
                },
                2 => FuzzOperation::RemoveMinter {
                    minter: Pubkey::new_unique(),
                },
                3 => FuzzOperation::UpdateMinterQuota {
                    minter: Pubkey::new_unique(),
                    new_quota: u.arbitrary()?,
                },
                4 => FuzzOperation::MintTokens {
                    minter: Pubkey::new_unique(),
                    amount: u.arbitrary()?,
                },
                5 => FuzzOperation::BurnTokens {
                    amount: u.arbitrary()?,
                },
                6 => FuzzOperation::Pause,
                7 => FuzzOperation::Unpause,
                8 => FuzzOperation::AddToBlacklist {
                    user: Pubkey::new_unique(),
                    reason: generate_string(u, 20)?,
                },
                9 => FuzzOperation::RemoveFromBlacklist {
                    user: Pubkey::new_unique(),
                },
                10 => FuzzOperation::FreezeAccount {
                    account: Pubkey::new_unique(),
                },
                11 => FuzzOperation::ThawAccount {
                    account: Pubkey::new_unique(),
                },
                12 => FuzzOperation::SeizeTokens {
                    source: Pubkey::new_unique(),
                    destination: Pubkey::new_unique(),
                    amount: u.arbitrary()?,
                },
                13 => FuzzOperation::TransferAuthority {
                    new_authority: Pubkey::new_unique(),
                },
                14 => FuzzOperation::UpdateRoles {
                    blacklister: Pubkey::new_unique(),
                    pauser: Pubkey::new_unique(),
                    seizer: Pubkey::new_unique(),
                },
                _ => unreachable!(),
            };
            
            self.operations.push(operation);
        }
        
        Ok(())
    }

    /// Build the test configuration
    pub fn build(self) -> FuzzTestConfig {
        self.config
    }
}

impl Default for FuzzTestBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fuzz_test_builder() {
        let config = FuzzTestBuilder::new()
            .iterations(1000)
            .max_accounts(20)
            .max_operations(100)
            .verbose(true)
            .build();

        assert_eq!(config.iterations, 1000);
        assert_eq!(config.max_accounts, 20);
        assert_eq!(config.max_operations, 100);
        assert!(config.verbose);
    }

    #[test]
    fn test_state_tracker() {
        let mut tracker = FuzzStateTracker::new();
        
        // Test initial state
        assert!(!tracker.is_initialized);
        assert!(!tracker.is_paused);
        
        // Test blacklist
        let user = Pubkey::new_unique();
        assert!(!tracker.is_blacklisted(&user));
        tracker.blacklisted_addresses.push(user);
        assert!(tracker.is_blacklisted(&user));
        
        // Test minter tracking
        let minter = Pubkey::new_unique();
        tracker.minter_quotas.push((minter, 1_000_000, 0));
        let (quota, minted) = tracker.get_minter_info(&minter).unwrap();
        assert_eq!(quota, 1_000_000);
        assert_eq!(minted, 0);
        
        tracker.update_minter_minted(&minter, 500_000);
        let (_, minted) = tracker.get_minter_info(&minter).unwrap();
        assert_eq!(minted, 500_000);
    }

    #[test]
    fn test_generate_operations() {
        let mut builder = FuzzTestBuilder::new();
        let mut data = vec![0u8; 500];
        for (i, byte) in data.iter_mut().enumerate() {
            *byte = (i % 256) as u8;
        }
        
        let mut u = Unstructured::new(&data);
        builder.generate_operations(&mut u).unwrap();
        
        assert!(!builder.operations.is_empty());
        assert!(builder.operations.len() <= builder.config.max_operations);
    }
}