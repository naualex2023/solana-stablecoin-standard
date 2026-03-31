//! Fuzz Testing Invariants for SSS Token
//!
//! These invariants define properties that must always hold true
//! regardless of the sequence of operations performed.

use solana_sdk::pubkey::Pubkey;

/// Invariant: Total minted tokens cannot exceed total minter quotas
///
/// This invariant ensures that the sum of all minted tokens across
/// all minters never exceeds the sum of their quotas.
pub struct MintingQuotaInvariant {
    /// Sum of all minter quotas
    pub total_quotas: u64,
    /// Sum of all tokens actually minted
    pub total_minted: u64,
}

impl MintingQuotaInvariant {
    pub fn check(&self) -> bool {
        self.total_minted <= self.total_quotas
    }
}

/// Invariant: Paused tokens cannot be minted or burned
///
/// When a token is paused, no mint or burn operations should succeed.
pub struct PauseStateInvariant {
    pub is_paused: bool,
    pub last_mint_succeeded: bool,
    pub last_burn_succeeded: bool,
}

impl PauseStateInvariant {
    pub fn check(&self) -> bool {
        if self.is_paused {
            !self.last_mint_succeeded && !self.last_burn_succeeded
        } else {
            true // When not paused, operations can succeed or fail for other reasons
        }
    }
}

/// Invariant: Blacklisted addresses cannot send or receive tokens
///
/// If an address is blacklisted, transfers involving that address
/// as sender or receiver should fail.
pub struct BlacklistInvariant {
    pub sender_blacklisted: bool,
    pub receiver_blacklisted: bool,
    pub transfer_succeeded: bool,
}

impl BlacklistInvariant {
    pub fn check(&self) -> bool {
        if self.sender_blacklisted || self.receiver_blacklisted {
            !self.transfer_succeeded
        } else {
            true
        }
    }
}

/// Invariant: Minter minted amount never exceeds quota
///
/// For any individual minter, the amount they have minted must
/// always be <= their quota.
pub struct MinterQuotaInvariant {
    pub quota: u64,
    pub minted: u64,
}

impl MinterQuotaInvariant {
    pub fn check(&self) -> bool {
        self.minted <= self.quota
    }
}

/// Invariant: Authority roles are mutually exclusive (optional)
///
/// Different roles (blacklister, pauser, seizer) can optionally
/// be required to be different addresses.
pub struct RoleSeparationInvariant {
    pub blacklister: Pubkey,
    pub pauser: Pubkey,
    pub seizer: Pubkey,
    pub require_separation: bool,
}

impl RoleSeparationInvariant {
    pub fn check(&self) -> bool {
        if self.require_separation {
            self.blacklister != self.pauser
                && self.blacklister != self.seizer
                && self.pauser != self.seizer
        } else {
            true
        }
    }
}

/// Invariant: Token supply consistency
///
/// Total supply = sum of all token account balances
/// This is enforced by SPL Token, but we verify it holds.
pub struct SupplyConsistencyInvariant {
    pub reported_supply: u64,
    pub computed_supply: u64,
}

impl SupplyConsistencyInvariant {
    pub fn check(&self) -> bool {
        self.reported_supply == self.computed_supply
    }
}

/// Invariant: Config state consistency
///
/// The config account should always be in a valid state.
pub struct ConfigStateInvariant {
    pub bump_valid: bool,
    pub decimals_valid: bool,
    pub name_len_valid: bool,
    pub symbol_len_valid: bool,
    pub uri_len_valid: bool,
}

impl ConfigStateInvariant {
    pub fn check(&self) -> bool {
        self.bump_valid
            && self.decimals_valid
            && self.name_len_valid
            && self.symbol_len_valid
            && self.uri_len_valid
    }
}

/// Invariant: Freeze authority consistency
///
/// Only the freeze authority can freeze/unfreeze accounts.
pub struct FreezeAuthorityInvariant {
    pub is_freeze_authority: bool,
    pub freeze_succeeded: bool,
    pub thaw_succeeded: bool,
}

impl FreezeAuthorityInvariant {
    pub fn check(&self) -> bool {
        if !self.is_freeze_authority {
            !self.freeze_succeeded && !self.thaw_succeeded
        } else {
            true
        }
    }
}

/// Invariant: Seizure requires permanent delegate
///
/// Token seizure can only occur if permanent delegate is enabled.
pub struct SeizureInvariant {
    pub permanent_delegate_enabled: bool,
    pub seizure_succeeded: bool,
}

impl SeizureInvariant {
    pub fn check(&self) -> bool {
        if !self.permanent_delegate_enabled {
            !self.seizure_succeeded
        } else {
            true
        }
    }
}

/// Invariant: Blacklist requires transfer hook
///
/// Blacklist operations can only succeed if transfer hook is enabled.
pub struct BlacklistFeatureInvariant {
    pub transfer_hook_enabled: bool,
    pub blacklist_add_succeeded: bool,
}

impl BlacklistFeatureInvariant {
    pub fn check(&self) -> bool {
        if !self.transfer_hook_enabled {
            !self.blacklist_add_succeeded
        } else {
            true
        }
    }
}

/// Invariant: Authority transfer requires current authority signature
///
/// Only the current authority can transfer authority to a new address.
pub struct AuthorityTransferInvariant {
    pub is_current_authority: bool,
    pub transfer_succeeded: bool,
}

impl AuthorityTransferInvariant {
    pub fn check(&self) -> bool {
        if !self.is_current_authority {
            !self.transfer_succeeded
        } else {
            true
        }
    }
}

/// Invariant: Quota monotonicity
///
/// A minter's minted amount can only increase (until reset by admin).
pub struct QuotaMonotonicityInvariant {
    pub previous_minted: u64,
    pub current_minted: u64,
    pub was_reset: bool,
}

impl QuotaMonotonicityInvariant {
    pub fn check(&self) -> bool {
        if self.was_reset {
            true // Admin can reset minted amount
        } else {
            self.current_minted >= self.previous_minted
        }
    }
}

/// Invariant: Blacklist consistency with transfer hook
///
/// If a user is blacklisted, any transfer involving them must fail.
pub struct BlacklistConsistencyInvariant {
    pub sender_blacklisted: bool,
    pub receiver_blacklisted: bool,
    pub transfer_succeeded: bool,
    pub hook_enabled: bool,
}

impl BlacklistConsistencyInvariant {
    pub fn check(&self) -> bool {
        if self.hook_enabled && (self.sender_blacklisted || self.receiver_blacklisted) {
            !self.transfer_succeeded
        } else {
            true
        }
    }
}

/// Invariant: Frozen account cannot transfer
///
/// If an account is frozen, transfers from that account must fail.
pub struct FrozenAccountInvariant {
    pub source_frozen: bool,
    pub dest_frozen: bool,
    pub transfer_succeeded: bool,
}

impl FrozenAccountInvariant {
    pub fn check(&self) -> bool {
        if self.source_frozen || self.dest_frozen {
            !self.transfer_succeeded
        } else {
            true
        }
    }
}

/// Invariant: Decimal precision in amounts
///
/// Amounts must respect the token's decimal precision.
pub struct DecimalPrecisionInvariant {
    pub amount: u64,
    pub decimals: u8,
    pub max_supply: u64,
}

impl DecimalPrecisionInvariant {
    pub fn check(&self) -> bool {
        // Amount should not exceed max supply
        // And decimals should be valid (0-18 for most tokens)
        self.decimals <= 18 && self.amount <= self.max_supply
    }
}

/// Invariant: No reentrancy in transfers
///
/// Transfer operations should not be reentrant.
pub struct ReentrancyProtectionInvariant {
    pub transfer_in_progress: bool,
    pub nested_transfer_attempted: bool,
}

impl ReentrancyProtectionInvariant {
    pub fn check(&self) -> bool {
        if self.transfer_in_progress {
            !self.nested_transfer_attempted
        } else {
            true
        }
    }
}

/// Invariant: Role assignment uniqueness
///
/// Critical roles should optionally be assigned to unique addresses.
pub struct RoleUniquenessInvariant {
    pub blacklister: Pubkey,
    pub pauser: Pubkey,
    pub seizer: Pubkey,
    pub require_unique_roles: bool,
}

impl RoleUniquenessInvariant {
    pub fn check(&self) -> bool {
        if self.require_unique_roles {
            self.blacklister != self.pauser
                && self.blacklister != self.seizer
                && self.pauser != self.seizer
        } else {
            true
        }
    }
}

/// Invariant: Pause state consistency
///
/// When paused, no state-changing operations should succeed.
pub struct PauseStateConsistencyInvariant {
    pub is_paused: bool,
    pub mint_succeeded: bool,
    pub burn_succeeded: bool,
    pub transfer_succeeded: bool,
}

impl PauseStateConsistencyInvariant {
    pub fn check(&self) -> bool {
        if self.is_paused {
            !self.mint_succeeded && !self.burn_succeeded && !self.transfer_succeeded
        } else {
            true
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_minting_quota_invariant() {
        // Valid case: minted <= quota
        let valid = MintingQuotaInvariant {
            total_quotas: 1_000_000,
            total_minted: 500_000,
        };
        assert!(valid.check());

        // Invalid case: minted > quota
        let invalid = MintingQuotaInvariant {
            total_quotas: 1_000_000,
            total_minted: 1_500_000,
        };
        assert!(!invalid.check());
    }

    #[test]
    fn test_pause_state_invariant() {
        // When paused, operations should fail
        let paused_valid = PauseStateInvariant {
            is_paused: true,
            last_mint_succeeded: false,
            last_burn_succeeded: false,
        };
        assert!(paused_valid.check());

        // When paused but operation succeeded - invariant violation
        let paused_invalid = PauseStateInvariant {
            is_paused: true,
            last_mint_succeeded: true,
            last_burn_succeeded: false,
        };
        assert!(!paused_invalid.check());
    }

    #[test]
    fn test_blacklist_invariant() {
        // Blacklisted sender - transfer should fail
        let sender_blacklisted = BlacklistInvariant {
            sender_blacklisted: true,
            receiver_blacklisted: false,
            transfer_succeeded: false,
        };
        assert!(sender_blacklisted.check());

        // Blacklisted sender but transfer succeeded - violation
        let sender_violation = BlacklistInvariant {
            sender_blacklisted: true,
            receiver_blacklisted: false,
            transfer_succeeded: true,
        };
        assert!(!sender_violation.check());

        // Neither blacklisted - transfer can succeed
        let normal = BlacklistInvariant {
            sender_blacklisted: false,
            receiver_blacklisted: false,
            transfer_succeeded: true,
        };
        assert!(normal.check());
    }

    #[test]
    fn test_minter_quota_invariant() {
        let valid = MinterQuotaInvariant {
            quota: 1_000_000,
            minted: 999_999,
        };
        assert!(valid.check());

        let at_limit = MinterQuotaInvariant {
            quota: 1_000_000,
            minted: 1_000_000,
        };
        assert!(at_limit.check());

        let over_limit = MinterQuotaInvariant {
            quota: 1_000_000,
            minted: 1_000_001,
        };
        assert!(!over_limit.check());
    }

    #[test]
    fn test_seizure_invariant() {
        // Seizure without permanent delegate should fail
        let no_delegate = SeizureInvariant {
            permanent_delegate_enabled: false,
            seizure_succeeded: false,
        };
        assert!(no_delegate.check());

        // Seizure without delegate but succeeded - violation
        let violation = SeizureInvariant {
            permanent_delegate_enabled: false,
            seizure_succeeded: true,
        };
        assert!(!violation.check());

        // Seizure with delegate can succeed
        let with_delegate = SeizureInvariant {
            permanent_delegate_enabled: true,
            seizure_succeeded: true,
        };
        assert!(with_delegate.check());
    }

    #[test]
    fn test_authority_transfer_invariant() {
        // Non-authority cannot transfer
        let non_auth = AuthorityTransferInvariant {
            is_current_authority: false,
            transfer_succeeded: false,
        };
        assert!(non_auth.check());

        // Non-authority but transfer succeeded - violation
        let violation = AuthorityTransferInvariant {
            is_current_authority: false,
            transfer_succeeded: true,
        };
        assert!(!violation.check());

        // Current authority can transfer
        let auth = AuthorityTransferInvariant {
            is_current_authority: true,
            transfer_succeeded: true,
        };
        assert!(auth.check());
    }

    #[test]
    fn test_quota_monotonicity_invariant() {
        // Minted amount increased - valid
        let increased = QuotaMonotonicityInvariant {
            previous_minted: 100,
            current_minted: 200,
            was_reset: false,
        };
        assert!(increased.check());

        // Minted amount stayed same - valid
        let same = QuotaMonotonicityInvariant {
            previous_minted: 100,
            current_minted: 100,
            was_reset: false,
        };
        assert!(same.check());

        // Minted amount decreased without reset - violation
        let decreased = QuotaMonotonicityInvariant {
            previous_minted: 200,
            current_minted: 100,
            was_reset: false,
        };
        assert!(!decreased.check());

        // Minted amount decreased with reset - valid
        let reset = QuotaMonotonicityInvariant {
            previous_minted: 200,
            current_minted: 100,
            was_reset: true,
        };
        assert!(reset.check());
    }

    #[test]
    fn test_blacklist_consistency_invariant() {
        // Blacklisted sender with hook enabled - transfer should fail
        let sender_blacklisted = BlacklistConsistencyInvariant {
            sender_blacklisted: true,
            receiver_blacklisted: false,
            transfer_succeeded: false,
            hook_enabled: true,
        };
        assert!(sender_blacklisted.check());

        // Blacklisted sender but transfer succeeded - violation
        let violation = BlacklistConsistencyInvariant {
            sender_blacklisted: true,
            receiver_blacklisted: false,
            transfer_succeeded: true,
            hook_enabled: true,
        };
        assert!(!violation.check());

        // Hook disabled - transfer can succeed regardless
        let hook_disabled = BlacklistConsistencyInvariant {
            sender_blacklisted: true,
            receiver_blacklisted: false,
            transfer_succeeded: true,
            hook_enabled: false,
        };
        assert!(hook_disabled.check());
    }

    #[test]
    fn test_frozen_account_invariant() {
        // Frozen source - transfer should fail
        let frozen_source = FrozenAccountInvariant {
            source_frozen: true,
            dest_frozen: false,
            transfer_succeeded: false,
        };
        assert!(frozen_source.check());

        // Frozen dest - transfer should fail
        let frozen_dest = FrozenAccountInvariant {
            source_frozen: false,
            dest_frozen: true,
            transfer_succeeded: false,
        };
        assert!(frozen_dest.check());

        // Frozen but transfer succeeded - violation
        let violation = FrozenAccountInvariant {
            source_frozen: true,
            dest_frozen: false,
            transfer_succeeded: true,
        };
        assert!(!violation.check());

        // Neither frozen - transfer can succeed
        let normal = FrozenAccountInvariant {
            source_frozen: false,
            dest_frozen: false,
            transfer_succeeded: true,
        };
        assert!(normal.check());
    }

    #[test]
    fn test_decimal_precision_invariant() {
        // Valid decimals and amount
        let valid = DecimalPrecisionInvariant {
            amount: 1_000_000,
            decimals: 9,
            max_supply: 1_000_000_000,
        };
        assert!(valid.check());

        // Invalid decimals (> 18)
        let invalid_decimals = DecimalPrecisionInvariant {
            amount: 100,
            decimals: 20,
            max_supply: 1_000_000_000,
        };
        assert!(!invalid_decimals.check());

        // Amount exceeds max supply
        let exceeds_supply = DecimalPrecisionInvariant {
            amount: 2_000_000_000,
            decimals: 9,
            max_supply: 1_000_000_000,
        };
        assert!(!exceeds_supply.check());
    }

    #[test]
    fn test_reentrancy_protection_invariant() {
        // No reentrancy - valid
        let no_reentrancy = ReentrancyProtectionInvariant {
            transfer_in_progress: false,
            nested_transfer_attempted: true,
        };
        assert!(no_reentrancy.check());

        // Transfer in progress, no nested - valid
        let transfer_active = ReentrancyProtectionInvariant {
            transfer_in_progress: true,
            nested_transfer_attempted: false,
        };
        assert!(transfer_active.check());

        // Reentrancy attempted - violation
        let reentrancy = ReentrancyProtectionInvariant {
            transfer_in_progress: true,
            nested_transfer_attempted: true,
        };
        assert!(!reentrancy.check());
    }

    #[test]
    fn test_role_uniqueness_invariant() {
        let addr1 = Pubkey::new_unique();
        let addr2 = Pubkey::new_unique();
        let addr3 = Pubkey::new_unique();

        // Unique roles when required - valid
        let unique = RoleUniquenessInvariant {
            blacklister: addr1,
            pauser: addr2,
            seizer: addr3,
            require_unique_roles: true,
        };
        assert!(unique.check());

        // Duplicate roles when not required - valid
        let duplicate_ok = RoleUniquenessInvariant {
            blacklister: addr1,
            pauser: addr1,
            seizer: addr1,
            require_unique_roles: false,
        };
        assert!(duplicate_ok.check());

        // Duplicate roles when required - violation
        let duplicate_violation = RoleUniquenessInvariant {
            blacklister: addr1,
            pauser: addr1,
            seizer: addr2,
            require_unique_roles: true,
        };
        assert!(!duplicate_violation.check());
    }

    #[test]
    fn test_pause_state_consistency_invariant() {
        // Not paused - operations can succeed
        let not_paused = PauseStateConsistencyInvariant {
            is_paused: false,
            mint_succeeded: true,
            burn_succeeded: true,
            transfer_succeeded: true,
        };
        assert!(not_paused.check());

        // Paused - all operations should fail
        let paused_valid = PauseStateConsistencyInvariant {
            is_paused: true,
            mint_succeeded: false,
            burn_succeeded: false,
            transfer_succeeded: false,
        };
        assert!(paused_valid.check());

        // Paused but operation succeeded - violation
        let paused_violation = PauseStateConsistencyInvariant {
            is_paused: true,
            mint_succeeded: true,
            burn_succeeded: false,
            transfer_succeeded: false,
        };
        assert!(!paused_violation.check());
    }
}
