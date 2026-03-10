#!/usr/bin/env node
/**
 * SSS Token Admin CLI
 *
 * Command-line interface for managing SSS Token stablecoins on Solana.
 * Supports both SSS-1 (minimal) and SSS-2 (compliant) presets.
 *
 * Usage:
 *   sss-token init --preset sss-1
 *   sss-token mint <recipient> <amount>
 *   sss-token burn <amount>
 *   sss-token freeze <address>
 *   sss-token thaw <address>
 *   sss-token pause / unpause
 *   sss-token status / supply
 *   sss-token blacklist add/remove <address>
 *   sss-token seize <address> --to <treasury>
 *   sss-token minters list/add/remove
 *   sss-token holders [--min-balance <amount>]
 *   sss-token audit-log [--action <type>]
 */
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
// Load environment variables
dotenv.config();
// Import Solana dependencies
import { Connection, Keypair, PublicKey, } from "@solana/web3.js";
import { getAccount, getMint, getOrCreateAssociatedTokenAccount, TOKEN_2022_PROGRAM_ID, } from "@solana/spl-token";
import pkg from "@coral-xyz/anchor";
const { AnchorProvider, Wallet, BN } = pkg;
// Import SDK - use the built SDK from dist (CommonJS)
// The SDK should be built first: cd ../sdk && npm run build
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const sdkPkg = require("../../sdk/dist/index.js");
const SSSTokenClient = sdkPkg.SSSTokenClient;
const findConfigPDA = sdkPkg.findConfigPDA;
const SSS_TOKEN_PROGRAM_ID = sdkPkg.SSS_TOKEN_PROGRAM_ID;
const program = new Command();
let config = {
    rpcUrl: process.env.ANCHOR_PROVIDER_URL || "http://localhost:8899",
    keypairPath: process.env.ANCHOR_KEYPAIR_PATH || `${process.env.HOME}/.config/solana/id.json`,
};
// Helper functions
function loadKeypair(keypairPath) {
    const expandedPath = keypairPath.startsWith("~")
        ? path.join(process.env.HOME || "", keypairPath.slice(1))
        : keypairPath;
    const secretKey = JSON.parse(fs.readFileSync(expandedPath, "utf-8"));
    return Keypair.fromSecretKey(new Uint8Array(secretKey));
}
async function getConnection() {
    return new Connection(config.rpcUrl, "confirmed");
}
async function getProvider() {
    const connection = await getConnection();
    const keypair = loadKeypair(config.keypairPath);
    const wallet = new Wallet(keypair);
    const provider = new AnchorProvider(connection, wallet, {});
    return { provider, wallet, connection };
}
async function getSDK() {
    const { provider, wallet, connection } = await getProvider();
    const sdk = new SSSTokenClient({ provider });
    return { sdk, connection, wallet };
}
function parseAmount(amountStr, decimals = 6) {
    // Handle both raw amounts and decimal amounts
    if (amountStr.includes(".")) {
        const [whole, fractional = ""] = amountStr.split(".");
        const paddedFractional = fractional.padEnd(decimals, "0").slice(0, decimals);
        return new BN(whole + paddedFractional);
    }
    return new BN(amountStr);
}
function formatAmount(amount, decimals = 6) {
    const amountStr = amount.toString().padStart(decimals + 1, "0");
    const whole = amountStr.slice(0, -decimals) || "0";
    const fractional = amountStr.slice(-decimals).replace(/0+$/, "");
    return fractional ? `${whole}.${fractional}` : whole;
}
async function ensureMint(mintArg) {
    if (mintArg) {
        return new PublicKey(mintArg);
    }
    // Try to load from config file
    const configPath = path.join(process.cwd(), ".sss-token.json");
    if (fs.existsSync(configPath)) {
        const savedConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        if (savedConfig.mint) {
            return new PublicKey(savedConfig.mint);
        }
    }
    throw new Error("No mint specified. Use --mint option or run 'sss-token init' first.");
}
const spinner = ora();
// ============== INIT COMMAND ==============
program
    .command("init")
    .description("Initialize a new stablecoin")
    .option("--preset <preset>", "Preset to use: sss-1, sss-2, or custom", "sss-1")
    .option("--custom <config>", "Path to custom config file (TOML/JSON)")
    .option("--name <name>", "Token name")
    .option("--symbol <symbol>", "Token symbol")
    .option("--decimals <decimals>", "Token decimals", "6")
    .option("--uri <uri>", "Metadata URI")
    .option("--mint <mint>", "Existing mint address (optional)")
    .option("-y, --yes", "Skip confirmation prompts", false)
    .action(async (options) => {
    try {
        spinner.start("Initializing stablecoin...");
        const { sdk, connection, wallet } = await getSDK();
        let initParams;
        // Determine preset
        if (options.custom) {
            // Load custom config
            const configContent = fs.readFileSync(options.custom, "utf-8");
            if (options.custom.endsWith(".toml")) {
                const toml = require("toml");
                initParams = toml.parse(configContent);
            }
            else {
                initParams = JSON.parse(configContent);
            }
        }
        else {
            // Use preset
            const preset = options.preset.toLowerCase();
            if (preset === "sss-1") {
                initParams = {
                    name: options.name || "My Stablecoin",
                    symbol: options.symbol || "MYST",
                    uri: options.uri || "",
                    decimals: parseInt(options.decimals),
                    enablePermanentDelegate: false,
                    enableTransferHook: false,
                    defaultAccountFrozen: false,
                };
            }
            else if (preset === "sss-2") {
                initParams = {
                    name: options.name || "My Stablecoin",
                    symbol: options.symbol || "MYST",
                    uri: options.uri || "",
                    decimals: parseInt(options.decimals),
                    enablePermanentDelegate: true,
                    enableTransferHook: true,
                    defaultAccountFrozen: false,
                };
            }
            else {
                spinner.fail(`Unknown preset: ${preset}. Use sss-1, sss-2, or --custom`);
                return;
            }
        }
        // Prompt for missing info if needed (skip if --yes flag is set)
        if (!options.name && !options.custom && !options.yes) {
            const answers = await inquirer.prompt([
                { type: "input", name: "name", message: "Token name:", default: initParams.name },
                { type: "input", name: "symbol", message: "Token symbol:", default: initParams.symbol },
                { type: "input", name: "uri", message: "Metadata URI (optional):", default: initParams.uri },
            ]);
            initParams.name = answers.name;
            initParams.symbol = answers.symbol;
            initParams.uri = answers.uri;
        }
        spinner.text = "Creating mint...";
        // Create mint or use existing
        let mint;
        if (options.mint) {
            mint = new PublicKey(options.mint);
        }
        else {
            // Create new mint with Token-2022
            const { createMint } = await import("@solana/spl-token");
            const keypair = loadKeypair(config.keypairPath);
            mint = await createMint(connection, keypair, wallet.publicKey, wallet.publicKey, // freeze authority
            initParams.decimals, undefined, undefined, TOKEN_2022_PROGRAM_ID);
        }
        spinner.text = "Initializing stablecoin config...";
        const keypair = loadKeypair(config.keypairPath);
        const tx = await sdk.initialize(mint, keypair, initParams);
        // Save config
        const configPath = path.join(process.cwd(), ".sss-token.json");
        fs.writeFileSync(configPath, JSON.stringify({
            mint: mint.toString(),
            name: initParams.name,
            symbol: initParams.symbol,
            decimals: initParams.decimals,
            preset: options.preset,
            programId: SSS_TOKEN_PROGRAM_ID,
        }, null, 2));
        spinner.succeed(chalk.green(`Stablecoin initialized successfully!`));
        console.log();
        console.log(chalk.cyan("  Mint:"), mint.toString());
        console.log(chalk.cyan("  Name:"), initParams.name);
        console.log(chalk.cyan("  Symbol:"), initParams.symbol);
        console.log(chalk.cyan("  Preset:"), options.preset.toUpperCase());
        console.log(chalk.cyan("  Transaction:"), tx);
        console.log();
        console.log(chalk.gray(`  Config saved to: ${configPath}`));
    }
    catch (error) {
        spinner.fail(chalk.red(`Initialization failed: ${error.message}`));
        console.error(error);
    }
});
// ============== MINT COMMAND ==============
program
    .command("mint <recipient> <amount>")
    .description("Mint tokens to a recipient address")
    .option("--mint <mint>", "Mint address")
    .option("--minter <minter>", "Minter keypair path (defaults to wallet)")
    .action(async (recipientStr, amountStr, options) => {
    try {
        spinner.start("Minting tokens...");
        const { sdk, connection, wallet } = await getSDK();
        const mint = await ensureMint(options.mint);
        const recipient = new PublicKey(recipientStr);
        const amount = parseAmount(amountStr);
        // Get or create token account
        spinner.text = "Getting token account...";
        const tokenAccount = await getOrCreateAssociatedTokenAccount(connection, loadKeypair(config.keypairPath), mint, recipient, undefined, undefined, undefined, TOKEN_2022_PROGRAM_ID);
        // Get minter info
        const minterKeypair = options.minter ? loadKeypair(options.minter) : loadKeypair(config.keypairPath);
        spinner.text = "Minting tokens...";
        const keypair = loadKeypair(config.keypairPath);
        const tx = await sdk.mintTokens(mint, keypair, minterKeypair.publicKey, tokenAccount.address, { amount });
        const configData = await sdk.getConfig(mint);
        const formattedAmount = formatAmount(amount, configData.decimals);
        spinner.succeed(chalk.green(`Minted ${formattedAmount} ${configData.symbol} to ${recipientStr}`));
        console.log(chalk.gray(`  Transaction: ${tx}`));
    }
    catch (error) {
        spinner.fail(chalk.red(`Mint failed: ${error.message}`));
    }
});
// ============== BURN COMMAND ==============
program
    .command("burn <amount>")
    .description("Burn tokens from your account")
    .option("--mint <mint>", "Mint address")
    .option("--from <account>", "Token account to burn from (defaults to your associated account)")
    .action(async (amountStr, options) => {
    try {
        spinner.start("Burning tokens...");
        const { sdk, connection, wallet } = await getSDK();
        const mint = await ensureMint(options.mint);
        const amount = parseAmount(amountStr);
        // Get token account
        let tokenAccount;
        if (options.from) {
            tokenAccount = new PublicKey(options.from);
        }
        else {
            const ata = await getOrCreateAssociatedTokenAccount(connection, loadKeypair(config.keypairPath), mint, wallet.publicKey, undefined, undefined, undefined, TOKEN_2022_PROGRAM_ID);
            tokenAccount = ata.address;
        }
        const keypair = loadKeypair(config.keypairPath);
        const tx = await sdk.burnTokens(mint, tokenAccount, keypair, { amount });
        const configData = await sdk.getConfig(mint);
        const formattedAmount = formatAmount(amount, configData.decimals);
        spinner.succeed(chalk.green(`Burned ${formattedAmount} ${configData.symbol}`));
        console.log(chalk.gray(`  Transaction: ${tx}`));
    }
    catch (error) {
        spinner.fail(chalk.red(`Burn failed: ${error.message}`));
    }
});
// ============== FREEZE COMMAND ==============
program
    .command("freeze <address>")
    .description("Freeze a token account")
    .option("--mint <mint>", "Mint address")
    .action(async (addressStr, options) => {
    try {
        spinner.start("Freezing account...");
        const { sdk, wallet } = await getSDK();
        const mint = await ensureMint(options.mint);
        const tokenAccount = new PublicKey(addressStr);
        const keypair = loadKeypair(config.keypairPath);
        const tx = await sdk.freezeTokenAccount(mint, tokenAccount, keypair);
        spinner.succeed(chalk.green(`Account frozen: ${addressStr}`));
        console.log(chalk.gray(`  Transaction: ${tx}`));
    }
    catch (error) {
        spinner.fail(chalk.red(`Freeze failed: ${error.message}`));
    }
});
// ============== THAW COMMAND ==============
program
    .command("thaw <address>")
    .description("Unfreeze a token account")
    .option("--mint <mint>", "Mint address")
    .action(async (addressStr, options) => {
    try {
        spinner.start("Thawing account...");
        const { sdk, wallet } = await getSDK();
        const mint = await ensureMint(options.mint);
        const tokenAccount = new PublicKey(addressStr);
        const keypair = loadKeypair(config.keypairPath);
        const tx = await sdk.thawTokenAccount(mint, tokenAccount, keypair);
        spinner.succeed(chalk.green(`Account unfrozen: ${addressStr}`));
        console.log(chalk.gray(`  Transaction: ${tx}`));
    }
    catch (error) {
        spinner.fail(chalk.red(`Thaw failed: ${error.message}`));
    }
});
// ============== PAUSE COMMAND ==============
program
    .command("pause")
    .description("Pause all token operations")
    .option("--mint <mint>", "Mint address")
    .action(async (options) => {
    try {
        spinner.start("Pausing token operations...");
        const { sdk, wallet } = await getSDK();
        const mint = await ensureMint(options.mint);
        const keypair = loadKeypair(config.keypairPath);
        const tx = await sdk.pause(mint, keypair);
        spinner.succeed(chalk.green("Token operations paused"));
        console.log(chalk.gray(`  Transaction: ${tx}`));
    }
    catch (error) {
        spinner.fail(chalk.red(`Pause failed: ${error.message}`));
    }
});
// ============== UNPAUSE COMMAND ==============
program
    .command("unpause")
    .description("Resume all token operations")
    .option("--mint <mint>", "Mint address")
    .action(async (options) => {
    try {
        spinner.start("Resuming token operations...");
        const { sdk, wallet } = await getSDK();
        const mint = await ensureMint(options.mint);
        const keypair = loadKeypair(config.keypairPath);
        const tx = await sdk.unpause(mint, keypair);
        spinner.succeed(chalk.green("Token operations resumed"));
        console.log(chalk.gray(`  Transaction: ${tx}`));
    }
    catch (error) {
        spinner.fail(chalk.red(`Unpause failed: ${error.message}`));
    }
});
// ============== STATUS COMMAND ==============
program
    .command("status")
    .description("Show stablecoin status and configuration")
    .option("--mint <mint>", "Mint address")
    .action(async (options) => {
    try {
        spinner.start("Fetching status...");
        const { sdk, connection } = await getSDK();
        const mint = await ensureMint(options.mint);
        const configData = await sdk.getConfig(mint);
        const mintInfo = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
        spinner.stop();
        console.log();
        console.log(chalk.cyan.bold("=== Stablecoin Status ==="));
        console.log();
        console.log(chalk.cyan("  Name:"), configData.name);
        console.log(chalk.cyan("  Symbol:"), configData.symbol);
        console.log(chalk.cyan("  Mint:"), mint.toString());
        console.log(chalk.cyan("  Decimals:"), configData.decimals);
        console.log(chalk.cyan("  Paused:"), configData.paused ? chalk.red("YES") : chalk.green("NO"));
        console.log();
        console.log(chalk.cyan("  Total Supply:"), formatAmount(new BN(mintInfo.supply.toString()), configData.decimals));
        console.log();
        console.log(chalk.cyan.bold("  === Roles ==="));
        console.log(chalk.cyan("  Master Authority:"), configData.masterAuthority.toString());
        console.log(chalk.cyan("  Blacklister:"), configData.blacklister?.toString() || "Not set");
        console.log(chalk.cyan("  Pauser:"), configData.pauser?.toString() || "Not set");
        console.log(chalk.cyan("  Seizer:"), configData.seizer?.toString() || "Not set");
        console.log();
        console.log(chalk.cyan.bold("  === Features ==="));
        console.log(chalk.cyan("  Permanent Delegate:"), configData.enablePermanentDelegate ? chalk.green("Enabled") : chalk.gray("Disabled"));
        console.log(chalk.cyan("  Transfer Hook:"), configData.enableTransferHook ? chalk.green("Enabled") : chalk.gray("Disabled"));
        console.log(chalk.cyan("  Default Frozen:"), configData.defaultAccountFrozen ? chalk.yellow("Yes") : chalk.gray("No"));
        console.log();
    }
    catch (error) {
        spinner.fail(chalk.red(`Failed to fetch status: ${error.message}`));
    }
});
// ============== SUPPLY COMMAND ==============
program
    .command("supply")
    .description("Show total token supply")
    .option("--mint <mint>", "Mint address")
    .action(async (options) => {
    try {
        spinner.start("Fetching supply...");
        const { sdk, connection } = await getSDK();
        const mint = await ensureMint(options.mint);
        const configData = await sdk.getConfig(mint);
        const mintInfo = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
        const supply = formatAmount(new BN(mintInfo.supply.toString()), configData.decimals);
        spinner.succeed(chalk.green(`Total Supply: ${supply} ${configData.symbol}`));
    }
    catch (error) {
        spinner.fail(chalk.red(`Failed to fetch supply: ${error.message}`));
    }
});
// ============== BLACKLIST COMMANDS ==============
const blacklistCmd = program.command("blacklist").description("Blacklist management (SSS-2)");
blacklistCmd
    .command("add <address>")
    .description("Add an address to the blacklist")
    .option("--mint <mint>", "Mint address")
    .option("--reason <reason>", "Reason for blacklisting", "Compliance violation")
    .action(async (addressStr, options) => {
    try {
        spinner.start("Adding to blacklist...");
        const { sdk, wallet } = await getSDK();
        const mint = await ensureMint(options.mint);
        const address = new PublicKey(addressStr);
        const keypair = loadKeypair(config.keypairPath);
        const tx = await sdk.addToBlacklist(mint, keypair, {
            user: address,
            reason: options.reason,
        });
        spinner.succeed(chalk.green(`Added to blacklist: ${addressStr}`));
        console.log(chalk.gray(`  Reason: ${options.reason}`));
        console.log(chalk.gray(`  Transaction: ${tx}`));
    }
    catch (error) {
        spinner.fail(chalk.red(`Failed to add to blacklist: ${error.message}`));
    }
});
blacklistCmd
    .command("remove <address>")
    .description("Remove an address from the blacklist")
    .option("--mint <mint>", "Mint address")
    .action(async (addressStr, options) => {
    try {
        spinner.start("Removing from blacklist...");
        const { sdk, wallet } = await getSDK();
        const mint = await ensureMint(options.mint);
        const address = new PublicKey(addressStr);
        const keypair = loadKeypair(config.keypairPath);
        const tx = await sdk.removeFromBlacklist(mint, keypair, {
            user: address,
        });
        spinner.succeed(chalk.green(`Removed from blacklist: ${addressStr}`));
        console.log(chalk.gray(`  Transaction: ${tx}`));
    }
    catch (error) {
        spinner.fail(chalk.red(`Failed to remove from blacklist: ${error.message}`));
    }
});
blacklistCmd
    .command("check <address>")
    .description("Check if an address is blacklisted")
    .option("--mint <mint>", "Mint address")
    .action(async (addressStr, options) => {
    try {
        spinner.start("Checking blacklist status...");
        const { sdk } = await getSDK();
        const mint = await ensureMint(options.mint);
        const address = new PublicKey(addressStr);
        const isBlacklisted = await sdk.isBlacklisted(mint, address);
        if (isBlacklisted) {
            const entry = await sdk.getBlacklistEntry(mint, address);
            spinner.fail(chalk.red(`Address IS blacklisted`));
            console.log(chalk.gray(`  Reason: ${entry.reason}`));
            console.log(chalk.gray(`  Timestamp: ${new Date(entry.timestamp.toNumber() * 1000).toISOString()}`));
        }
        else {
            spinner.succeed(chalk.green(`Address is NOT blacklisted`));
        }
    }
    catch (error) {
        spinner.fail(chalk.red(`Failed to check blacklist: ${error.message}`));
    }
});
// ============== SEIZE COMMAND ==============
program
    .command("seize <sourceAccount>")
    .description("Seize tokens from an account (SSS-2)")
    .option("--mint <mint>", "Mint address")
    .option("--to <treasury>", "Treasury account to receive seized tokens")
    .option("--amount <amount>", "Amount to seize (default: all)")
    .action(async (sourceAccountStr, options) => {
    try {
        spinner.start("Seizing tokens...");
        const { sdk, connection, wallet } = await getSDK();
        const mint = await ensureMint(options.mint);
        const sourceAccount = new PublicKey(sourceAccountStr);
        // Get or create treasury account
        let destAccount;
        if (options.to) {
            destAccount = new PublicKey(options.to);
        }
        else {
            const treasury = await getOrCreateAssociatedTokenAccount(connection, loadKeypair(config.keypairPath), mint, wallet.publicKey, undefined, undefined, undefined, TOKEN_2022_PROGRAM_ID);
            destAccount = treasury.address;
        }
        // Determine amount
        let amount;
        if (options.amount) {
            amount = parseAmount(options.amount);
        }
        else {
            const accountInfo = await getAccount(connection, sourceAccount, "confirmed", TOKEN_2022_PROGRAM_ID);
            amount = new BN(accountInfo.amount.toString());
        }
        const keypair = loadKeypair(config.keypairPath);
        const tx = await sdk.seize(mint, keypair, {
            sourceToken: sourceAccount,
            destToken: destAccount,
            amount,
        });
        const configData = await sdk.getConfig(mint);
        const formattedAmount = formatAmount(amount, configData.decimals);
        spinner.succeed(chalk.green(`Seized ${formattedAmount} ${configData.symbol}`));
        console.log(chalk.gray(`  Source: ${sourceAccountStr}`));
        console.log(chalk.gray(`  Transaction: ${tx}`));
    }
    catch (error) {
        spinner.fail(chalk.red(`Seize failed: ${error.message}`));
    }
});
// ============== MINTERS COMMANDS ==============
const mintersCmd = program.command("minters").description("Minter management");
mintersCmd
    .command("list")
    .description("List all authorized minters")
    .option("--mint <mint>", "Mint address")
    .action(async (options) => {
    try {
        spinner.start("Fetching minters...");
        const { sdk } = await getSDK();
        const mint = await ensureMint(options.mint);
        const configData = await sdk.getConfig(mint);
        spinner.stop();
        console.log();
        console.log(chalk.cyan.bold("=== Authorized Minters ==="));
        console.log();
        console.log(chalk.gray("  Note: Use 'sss-token minters info <address>' for details"));
        console.log();
        // We would need to fetch all minter PDAs, which requires indexing
        // For now, show a message
        console.log(chalk.yellow("  To view minter info, use: sss-token minters info <minter-address>"));
    }
    catch (error) {
        spinner.fail(chalk.red(`Failed to fetch minters: ${error.message}`));
    }
});
mintersCmd
    .command("add <address>")
    .description("Add a new minter")
    .option("--mint <mint>", "Mint address")
    .option("--quota <quota>", "Minting quota", "1000000000000")
    .action(async (addressStr, options) => {
    try {
        spinner.start("Adding minter...");
        const { sdk, wallet } = await getSDK();
        const mint = await ensureMint(options.mint);
        const minter = new PublicKey(addressStr);
        const quota = new BN(options.quota);
        const keypair = loadKeypair(config.keypairPath);
        const tx = await sdk.addMinter(mint, keypair, {
            minter,
            quota,
        });
        const configData = await sdk.getConfig(mint);
        const formattedQuota = formatAmount(quota, configData.decimals);
        spinner.succeed(chalk.green(`Minter added: ${addressStr}`));
        console.log(chalk.gray(`  Quota: ${formattedQuota} ${configData.symbol}`));
        console.log(chalk.gray(`  Transaction: ${tx}`));
    }
    catch (error) {
        spinner.fail(chalk.red(`Failed to add minter: ${error.message}`));
    }
});
mintersCmd
    .command("remove <address>")
    .description("Remove a minter")
    .option("--mint <mint>", "Mint address")
    .action(async (addressStr, options) => {
    try {
        spinner.start("Removing minter...");
        const { sdk, wallet } = await getSDK();
        const mint = await ensureMint(options.mint);
        const minter = new PublicKey(addressStr);
        const keypair = loadKeypair(config.keypairPath);
        const tx = await sdk.removeMinter(mint, keypair, {
            minter,
        });
        spinner.succeed(chalk.green(`Minter removed: ${addressStr}`));
        console.log(chalk.gray(`  Transaction: ${tx}`));
    }
    catch (error) {
        spinner.fail(chalk.red(`Failed to remove minter: ${error.message}`));
    }
});
mintersCmd
    .command("info <address>")
    .description("Get minter info")
    .option("--mint <mint>", "Mint address")
    .action(async (addressStr, options) => {
    try {
        spinner.start("Fetching minter info...");
        const { sdk } = await getSDK();
        const mint = await ensureMint(options.mint);
        const minter = new PublicKey(addressStr);
        const minterInfo = await sdk.getMinterInfo(mint, minter);
        const configData = await sdk.getConfig(mint);
        const quota = formatAmount(minterInfo.quota, configData.decimals);
        const minted = formatAmount(minterInfo.minted, configData.decimals);
        const remaining = formatAmount(new BN(minterInfo.quota).sub(new BN(minterInfo.minted)), configData.decimals);
        spinner.stop();
        console.log();
        console.log(chalk.cyan.bold("=== Minter Info ==="));
        console.log();
        console.log(chalk.cyan("  Address:"), minter.toString());
        console.log(chalk.cyan("  Quota:"), `${quota} ${configData.symbol}`);
        console.log(chalk.cyan("  Minted:"), `${minted} ${configData.symbol}`);
        console.log(chalk.cyan("  Remaining:"), `${remaining} ${configData.symbol}`);
        console.log();
    }
    catch (error) {
        spinner.fail(chalk.red(`Failed to fetch minter info: ${error.message}`));
    }
});
mintersCmd
    .command("update-quota <address> <quota>")
    .description("Update minter quota")
    .option("--mint <mint>", "Mint address")
    .action(async (addressStr, quotaStr, options) => {
    try {
        spinner.start("Updating minter quota...");
        const { sdk, wallet } = await getSDK();
        const mint = await ensureMint(options.mint);
        const minter = new PublicKey(addressStr);
        const newQuota = new BN(quotaStr);
        const keypair = loadKeypair(config.keypairPath);
        const tx = await sdk.updateMinterQuota(mint, keypair, {
            minter,
            newQuota,
        });
        const configData = await sdk.getConfig(mint);
        const formattedQuota = formatAmount(newQuota, configData.decimals);
        spinner.succeed(chalk.green(`Minter quota updated: ${formattedQuota} ${configData.symbol}`));
        console.log(chalk.gray(`  Transaction: ${tx}`));
    }
    catch (error) {
        spinner.fail(chalk.red(`Failed to update quota: ${error.message}`));
    }
});
// ============== HOLDERS COMMAND ==============
program
    .command("holders")
    .description("List token holders (requires RPC with indexing)")
    .option("--mint <mint>", "Mint address")
    .option("--min-balance <amount>", "Minimum balance filter")
    .action(async (options) => {
    try {
        spinner.start("Fetching holders...");
        const { sdk, connection } = await getSDK();
        const mint = await ensureMint(options.mint);
        // Note: This requires a RPC provider with token account indexing
        // For local development, we can only show a message
        spinner.warn(chalk.yellow("Token holder indexing requires a specialized RPC provider"));
        console.log();
        console.log(chalk.gray("  For production use, consider:"));
        console.log(chalk.gray("  - Helius API"));
        console.log(chalk.gray("  - QuickNode with Token API"));
        console.log(chalk.gray("  - Solana FM"));
        console.log();
        console.log(chalk.gray("  Alternative: Use 'solana account <mint> --address <token-account>'"));
    }
    catch (error) {
        spinner.fail(chalk.red(`Failed to fetch holders: ${error.message}`));
    }
});
// ============== AUDIT-LOG COMMAND ==============
program
    .command("audit-log")
    .description("Show audit log (requires indexer)")
    .option("--mint <mint>", "Mint address")
    .option("--action <type>", "Filter by action type")
    .option("--limit <count>", "Number of entries", "50")
    .action(async (options) => {
    try {
        spinner.start("Fetching audit log...");
        const { sdk } = await getSDK();
        const mint = await ensureMint(options.mint);
        // Note: This requires an indexer service
        spinner.warn(chalk.yellow("Audit log requires the indexer service to be running"));
        console.log();
        console.log(chalk.gray("  Start the backend services with: docker compose up"));
        console.log(chalk.gray("  Or run the indexer manually"));
    }
    catch (error) {
        spinner.fail(chalk.red(`Failed to fetch audit log: ${error.message}`));
    }
});
// ============== ROLES COMMAND ==============
const rolesCmd = program.command("roles").description("Role management");
rolesCmd
    .command("update")
    .description("Update role assignments")
    .option("--mint <mint>", "Mint address")
    .option("--blacklister <address>", "New blacklister address")
    .option("--pauser <address>", "New pauser address")
    .option("--seizer <address>", "New seizer address")
    .action(async (options) => {
    try {
        spinner.start("Updating roles...");
        const { sdk, wallet } = await getSDK();
        const mint = await ensureMint(options.mint);
        // Get current config for any missing values
        const configData = await sdk.getConfig(mint);
        const params = {
            newBlacklister: options.blacklister
                ? new PublicKey(options.blacklister)
                : configData.blacklister || wallet.publicKey,
            newPauser: options.pauser
                ? new PublicKey(options.pauser)
                : configData.pauser || wallet.publicKey,
            newSeizer: options.seizer
                ? new PublicKey(options.seizer)
                : configData.seizer || wallet.publicKey,
        };
        const keypair = loadKeypair(config.keypairPath);
        const tx = await sdk.updateRoles(mint, keypair, params);
        spinner.succeed(chalk.green("Roles updated"));
        console.log(chalk.gray(`  Transaction: ${tx}`));
    }
    catch (error) {
        spinner.fail(chalk.red(`Failed to update roles: ${error.message}`));
    }
});
// ============== TRANSFER-AUTHORITY COMMAND ==============
program
    .command("transfer-authority <newAuthority>")
    .description("Transfer master authority to a new address")
    .option("--mint <mint>", "Mint address")
    .action(async (newAuthorityStr, options) => {
    try {
        spinner.start("Transferring authority...");
        const { sdk, wallet } = await getSDK();
        const mint = await ensureMint(options.mint);
        const newAuthority = new PublicKey(newAuthorityStr);
        const keypair = loadKeypair(config.keypairPath);
        const tx = await sdk.transferAuthority(mint, keypair, {
            newMasterAuthority: newAuthority,
        });
        spinner.succeed(chalk.green(`Authority transferred to: ${newAuthorityStr}`));
        console.log(chalk.yellow("  WARNING: You no longer have master authority!"));
        console.log(chalk.gray(`  Transaction: ${tx}`));
    }
    catch (error) {
        spinner.fail(chalk.red(`Failed to transfer authority: ${error.message}`));
    }
});
// ============== CONFIG COMMAND ==============
program
    .command("config")
    .description("Show or set CLI configuration")
    .option("--rpc <url>", "Set RPC URL")
    .option("--keypair <path>", "Set keypair path")
    .option("--mint <mint>", "Set default mint address")
    .action(async (options) => {
    try {
        const configPath = path.join(process.cwd(), ".sss-token.json");
        if (options.rpc) {
            config.rpcUrl = options.rpc;
            console.log(chalk.green(`RPC URL set to: ${options.rpc}`));
        }
        if (options.keypair) {
            config.keypairPath = options.keypair;
            console.log(chalk.green(`Keypair path set to: ${options.keypair}`));
        }
        if (options.mint) {
            const existingConfig = fs.existsSync(configPath)
                ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
                : {};
            existingConfig.mint = options.mint;
            fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2));
            console.log(chalk.green(`Default mint set to: ${options.mint}`));
        }
        // Show current config
        console.log();
        console.log(chalk.cyan.bold("=== Current Configuration ==="));
        console.log();
        console.log(chalk.cyan("  RPC URL:"), config.rpcUrl);
        console.log(chalk.cyan("  Keypair:"), config.keypairPath);
        if (fs.existsSync(configPath)) {
            const savedConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
            console.log(chalk.cyan("  Default Mint:"), savedConfig.mint || "Not set");
            console.log(chalk.cyan("  Preset:"), savedConfig.preset || "Unknown");
        }
        console.log();
    }
    catch (error) {
        console.error(chalk.red(`Config error: ${error.message}`));
    }
});
// ============== BALANCE COMMAND ==============
program
    .command("balance [address]")
    .description("Check token balance for an address")
    .option("--mint <mint>", "Mint address")
    .action(async (addressStr, options) => {
    try {
        spinner.start("Fetching balance...");
        const { sdk, connection, wallet } = await getSDK();
        const mint = await ensureMint(options?.mint);
        const owner = addressStr ? new PublicKey(addressStr) : wallet.publicKey;
        // Get associated token account
        const { getAssociatedTokenAddress } = await import("@solana/spl-token");
        const tokenAccount = await getAssociatedTokenAddress(mint, owner, undefined, TOKEN_2022_PROGRAM_ID);
        try {
            const accountInfo = await getAccount(connection, tokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID);
            const configData = await sdk.getConfig(mint);
            const balance = formatAmount(new BN(accountInfo.amount.toString()), configData.decimals);
            spinner.succeed(chalk.green(`Balance: ${balance} ${configData.symbol}`));
            console.log(chalk.gray(`  Account: ${tokenAccount.toString()}`));
            console.log(chalk.gray(`  Frozen: ${accountInfo.isFrozen ? "Yes" : "No"}`));
        }
        catch {
            spinner.fail(chalk.yellow("No token account found for this address"));
        }
    }
    catch (error) {
        spinner.fail(chalk.red(`Failed to fetch balance: ${error.message}`));
    }
});
// Parse arguments
program
    .name("sss-token")
    .description("Admin CLI for SSS Token Stablecoin operations")
    .version("1.0.0")
    .parse();
//# sourceMappingURL=index.js.map