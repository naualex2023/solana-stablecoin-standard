//! Trident Fuzz Tests for SSS Token Stablecoin
//!
//! This module contains fuzz testing invariants for the SSS Token program
//! using the Trident fuzzing framework.

pub mod invariants;
pub mod test_builder;

// Re-exports for convenience
pub use invariants::*;
pub use test_builder::*;