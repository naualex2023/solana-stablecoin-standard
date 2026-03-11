# SSS Token Compliance Guide

Comprehensive guide to regulatory compliance, audit trails, and best practices for SSS Token stablecoins.

## Table of Contents

- [Overview](#overview)
- [Regulatory Framework](#regulatory-framework)
- [KYC/AML Requirements](#kycaml-requirements)
- [Sanctions Screening](#sanctions-screening)
- [Audit Trail](#audit-trail)
- [Compliance Operations](#compliance-operations)
- [Reporting Requirements](#reporting-requirements)
- [Best Practices](#best-practices)

## Overview

SSS Token provides on-chain compliance controls designed to meet regulatory requirements for stablecoin issuers.

### Compliance Features

| Feature | SSS-1 | SSS-2 | Purpose |
|---------|-------|-------|---------|
| Blacklist | ❌ | ✅ | Sanctions enforcement |
| Freeze/Thaw | ❌ | ✅ | Account holds |
| Seizure | ❌ | ✅ | Asset forfeiture |
| Transfer Hook | ❌ | ✅ | Real-time compliance |
| Audit Logging | Optional | Required | Regulatory reporting |

## Regulatory Framework

### United States (FinCEN)

**Applicable Regulations:**
- Bank Secrecy Act (BSA)
- FinCEN Guidance on Convertible Virtual Currency
- OFAC Sanctions Regulations

**Requirements:**
- [ ] MSB registration (if applicable)
- [ ] AML program
- [ ] KYC procedures
- [ ] CTR/SAR filing
- [ ] OFAC screening

### European Union (MiCA)

**Applicable Regulations:**
- Markets in Crypto-Assets Regulation (MiCA)
- 5th/6th Anti-Money Laundering Directive (AMLD5/6)

**Requirements:**
- [ ] EMI or CASP license
- [ ] AML program
- [ ] KYC procedures
- [ ] Transaction monitoring
- [ ] Regulatory reporting

### Singapore (MAS)

**Applicable Regulations:**
- Payment Services Act
- MAS AML/CFT Guidelines

**Requirements:**
- [ ] MPI or DPT license
- [ ] AML program
- [ ] KYC procedures
- [ ] Transaction monitoring
- [ ] STR filing

## KYC/AML Requirements

### Customer Identification Program (CIP)

**Individual Verification:**
1. Full legal name
2. Date of birth
3. Residential address
4. Government-issued ID
5. Selfie verification (liveness check)

**Entity Verification:**
1. Legal entity name
2. Registration jurisdiction
3. Registered address
4. Beneficial owners (25%+)
5. Authorized representatives

### Enhanced Due Diligence (EDD)

Required for:
- PEPs (Politically Exposed Persons)
- High-risk jurisdictions
- Large transactions (>$10,000)
- Unusual activity patterns

### KYC Integration Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    KYC Integration Flow                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User creates token account                               │
│     └─► Account FROZEN (SSS-2 default)                       │
│                                                              │
│  2. User submits KYC documents                               │
│     └─► Via KYC provider integration                         │
│                                                              │
│  3. KYC provider verifies                                    │
│     └─► Identity verification                                │
│     └─► Sanctions screening                                  │
│     └─► Risk scoring                                         │
│                                                              │
│  4. Compliance review                                        │
│     └─► Auto-approve (low risk)                              │
│     └─► Manual review (medium/high risk)                     │
│                                                              │
│  5. Account activation                                       │
│     └─► Thaw token account                                   │
│     └─► Record approval in audit log                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### KYC Provider Integration

```typescript
// Example KYC webhook handler
app.post('/kyc/callback', async (req, res) => {
  const { userId, status, riskScore } = req.body;
  
  if (status === 'APPROVED') {
    // Get user's token account
    const tokenAccount = await getUserTokenAccount(userId);
    
    // Thaw account
    await stable.compliance.thaw(tokenAccount, freezeAuthority);
    
    // Log approval
    await auditLog({
      event: 'KYC_APPROVED',
      userId,
      riskScore,
      tokenAccount,
      timestamp: new Date().toISOString(),
    });
  }
  
  res.json({ received: true });
});
```

## Sanctions Screening

### Sanctions Lists

| List | Jurisdiction | Update Frequency |
|------|--------------|------------------|
| OFAC SDN | US | Real-time |
| OFAC Consolidated | US | Daily |
| EU Consolidated | EU | Daily |
| UN Security Council | Global | Daily |
| HM Treasury | UK | Daily |
| Local lists | Varies | Varies |

### Screening Process

```
┌─────────────────────────────────────────────────────────────┐
│                  Sanctions Screening Process                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Onboarding Screening                                     │
│     └─► Check all lists before account activation            │
│                                                              │
│  2. Ongoing Monitoring                                       │
│     └─► Daily re-screen of all users                         │
│     └─► Real-time list updates                               │
│                                                              │
│  3. Match Handling                                           │
│     └─► False positive → Document and clear                  │
│     └─► True positive → Freeze + Blacklist                   │
│                                                              │
│  4. Reporting                                                │
│     └─► Internal compliance log                              │
│     └─► Regulatory reporting if required                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Bulk Blacklist Import

```bash
#!/bin/bash
# ofac_import.sh - Import OFAC SDN list updates

OFAC_FILE="sdn_list.txt"
DATE=$(date +%Y-%m-%d)

while read address; do
  # Skip empty lines and comments
  [[ -z "$address" || "$address" == \#* ]] && continue
  
  # Check if already blacklisted
  if sss-token blacklist check "$address" | grep -q "not blacklisted"; then
    echo "Adding $address to blacklist..."
    sss-token blacklist add "$address" --reason "OFAC SDN $DATE"
  else
    echo "$address already blacklisted"
  fi
done < "$OFAC_FILE"

echo "OFAC import complete"
```

## Audit Trail

### Required Events

All compliance operations must be logged immutably:

| Event | Required Fields |
|-------|-----------------|
| `MINT` | amount, recipient, minter, tx_signature, timestamp |
| `BURN` | amount, account, burner, tx_signature, timestamp |
| `FREEZE` | account, reason, operator, tx_signature, timestamp |
| `THAW` | account, approval_id, operator, tx_signature, timestamp |
| `BLACKLIST_ADD` | address, reason, source_list, operator, tx_signature, timestamp |
| `BLACKLIST_REMOVE` | address, approval_id, operator, tx_signature, timestamp |
| `SEIZE` | source, destination, amount, legal_order_id, operator, tx_signature, timestamp |
| `PAUSE` | reason, operator, tx_signature, timestamp |
| `UNPAUSE` | incident_id, operator, tx_signature, timestamp |
| `AUTHORITY_TRANSFER` | old_authority, new_authority, approvals, tx_signature, timestamp |

### Audit Log Schema

```json
{
  "id": "uuid-v4",
  "event": "SEIZE",
  "mint": "MINT_ADDRESS",
  "data": {
    "source_account": "SOURCE_TOKEN_ACCOUNT",
    "destination_account": "TREASURY_ACCOUNT",
    "amount": 1000000,
    "legal_order_id": "COURT-2024-001"
  },
  "operator": {
    "address": "OPERATOR_WALLET_ADDRESS",
    "email": "compliance@example.com",
    "role": "seizer"
  },
  "transaction": {
    "signature": "TX_SIGNATURE",
    "slot": 123456789,
    "block_time": 1705312800
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "metadata": {
    "ip_address": "192.168.1.1",
    "user_agent": "CLI/1.0",
    "approval_ticket": "JIRA-123"
  }
}
```

### Audit Storage

**Options:**
1. **Database** (PostgreSQL, MongoDB)
   - Searchable
   - Real-time queries
   - Requires backup strategy

2. **Immutable Log** (Append-only)
   - Tamper-evident
   - Blockchain-based (e.g., Merkle tree)
   - Compliance-friendly

3. **On-Chain Events**
   - Solana transaction logs
   - Permanent, verifiable
   - Limited query capability

### Implementation

```typescript
// Backend audit logger
import { createHash } from 'crypto';

interface AuditEvent {
  event: string;
  mint: string;
  data: Record<string, any>;
  operator: {
    address: string;
    email: string;
    role: string;
  };
  transaction: {
    signature: string;
    slot: number;
    blockTime: number;
  };
}

async function logAuditEvent(event: AuditEvent): Promise<void> {
  const record = {
    id: uuidv4(),
    ...event,
    timestamp: new Date().toISOString(),
    hash: createHash('sha256')
      .update(JSON.stringify(event))
      .digest('hex'),
  };
  
  // Store in database
  await db.audit_logs.insert(record);
  
  // Also emit to immutable log service
  await immutableLog.append(record);
  
  // Log to monitoring
  console.log(JSON.stringify({
    level: 'INFO',
    message: `Audit event: ${event.event}`,
    audit_id: record.id,
    tx: event.transaction.signature,
  }));
}
```

## Compliance Operations

### Freeze Operation Workflow

There are two types of freeze operations depending on mint configuration:

**Regular Freeze (Keypair Authority)**
For mints where the freeze authority is a regular keypair:
```typescript
await stable.compliance.freeze(tokenAccount, freezeAuthority);
```

**PDA-Based Freeze (For Seize Operations)**
For mints with PDA-based freeze authority (SSS-2 with `enablePermanentDelegate: true`):
```typescript
// Freeze using PDA authority - seizer must be an authorized signer
await stable.compliance.freezePda(mint, tokenAccount, seizer);
```

**Freeze Workflow:**
```
1. Receive freeze request
   └─► Source: Compliance team, Legal, Law enforcement

2. Validate request
   └─► Verify authorization
   └─► Document reason

3. Execute freeze
   └─► Regular: sss-token freeze <ACCOUNT>
   └─► PDA-based: Use freezePda() with seizer authorization

4. Log and notify
   └─► Create audit record
   └─► Notify account holder (if permitted)

5. Periodic review
   └─► Weekly review of frozen accounts
   └─► Escalate long-held freezes
```

### Seizure Operation Workflow

> ⚠️ **Critical**: Seizure requires legal documentation

```
1. Receive seizure order
   └─► Court order, regulatory directive, or legal settlement

2. Verify legal authority
   └─► Legal team review
   └─► Document order reference

3. Freeze account (if not already)
   └─► sss-token freeze <ACCOUNT>

4. Collect approvals
   └─► Multi-sig approval (3-of-5)
   └─► Compliance sign-off
   └─► Legal sign-off

5. Execute seizure
   └─► sss-token seize <ACCOUNT> --to <TREASURY>

6. Document and report
   └─► Full audit record
   └─► Regulatory filing if required
   └─► Notify relevant parties
```

### Blacklist Operation Workflow

```
1. Identify address for blacklisting
   └─► Source: Sanctions list, Fraud detection, Law enforcement

2. Verify match
   └─► Confirm address identity
   └─► Document evidence

3. Execute blacklist
   └─► sss-token blacklist add <ADDRESS> --reason "..."

4. Handle existing positions
   └─► Freeze associated token accounts
   └─► Transfer hook blocks further transactions

5. Log and report
   └─► Audit record
   └─► SAR filing if applicable
```

## Reporting Requirements

### Suspicious Activity Reports (SAR)

**When to file:**
- Transactions > $5,000 with suspicious indicators
- Transactions > $25,000 regardless of suspicion (in some cases)
- Blacklist matches
- Unusual patterns

**Timeline:** Within 30 days of detection

### Currency Transaction Reports (CTR)

**When to file:**
- Cash transactions > $10,000

**Timeline:** Within 15 days

### Periodic Reporting

| Report | Frequency | Content |
|--------|-----------|---------|
| Token Supply | Daily | Total minted, burned, circulating |
| Compliance Summary | Weekly | Freezes, blacklists, seizures |
| Audit Review | Monthly | Review of all compliance actions |
| Regulatory Filing | As required | Jurisdiction-specific |

### Report Generation

```bash
#!/bin/bash
# generate_compliance_report.sh

DATE=$(date +%Y-%m-%d)
REPORT_DIR="/reports/$DATE"

mkdir -p "$REPORT_DIR"

# Token supply report
echo "Token Supply Report - $DATE" > "$REPORT_DIR/supply.txt"
echo "==========================" >> "$REPORT_DIR/supply.txt"
sss-token supply >> "$REPORT_DIR/supply.txt"

# Compliance events from last 24h
echo "Compliance Events - $DATE" > "$REPORT_DIR/events.txt"
echo "========================" >> "$REPORT_DIR/events.txt"
psql -c "SELECT * FROM audit_logs WHERE date = '$DATE'" >> "$REPORT_DIR/events.txt"

# Blacklist summary
echo "Blacklist Summary - $DATE" > "$REPORT_DIR/blacklist.txt"
echo "=========================" >> "$REPORT_DIR/blacklist.txt"
# Count blacklist entries from on-chain or database

echo "Reports generated in $REPORT_DIR"
```

## Best Practices

### Key Management

1. **Master Authority**
   - Store in HSM or offline multi-sig
   - Require 4-of-7 signatures
   - Annual key rotation

2. **Seizer Key**
   - Store in HSM or offline multi-sig
   - Require 3-of-5 signatures
   - Document all usage

3. **Blacklister/Pauser**
   - Hot wallet acceptable
   - Rate-limited operations
   - Daily usage review

### Access Control

1. **Principle of Least Privilege**
   - Operators only have required role
   - Regular access reviews

2. **Separation of Duties**
   - Different people for freeze vs. thaw
   - Different people for blacklist vs. remove

3. **Audit Trail**
   - Log all operations
   - Immutable storage
   - Regular review

### Incident Response

1. **Documented Procedures**
   - Runbook for each scenario
   - Escalation paths
   - Contact information

2. **Regular Drills**
   - Quarterly pause drill
   - Annual seizure simulation
   - Tabletop exercises

3. **Post-Incident Review**
   - Root cause analysis
   - Process improvements
   - Documentation updates

### Compliance Checklist

**Daily:**
- [ ] Review new blacklist entries
- [ ] Check for sanctions list updates
- [ ] Monitor large transactions

**Weekly:**
- [ ] Review frozen accounts
- [ ] Audit compliance operations
- [ ] Update risk scores

**Monthly:**
- [ ] Full audit review
- [ ] Key rotation check
- [ ] Training updates

**Annually:**
- [ ] Key rotation
- [ ] Policy review
- [ ] Regulatory update review

## References

- [SSS-2 Specification](./SSS-2.md)
- [Operations Guide](./OPERATIONS.md)
- [SDK Documentation](./SDK.md)
- FinCEN Guidance: https://www.fincen.gov/
- OFAC Sanctions: https://ofac.treasury.gov/