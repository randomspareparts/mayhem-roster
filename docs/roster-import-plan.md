# Mayhem 8724 roster import analysis — November 2026

## Source
User-owned Library file: `Mayhem_2027_Roster_Updated(1).xlsx` (updated November 13, 2026). Source workbook remains private and MUST NOT be committed to this public repository.

## Workbook sheets
- Overview
- Roster (A1:AG36; heading row 4; 32 data rows)
- Sheet1
- Apparel Orders
- Guide
- Source Archive
- Survey Review

## Roster category summary
- 32 entries total
- 23 labeled **Confirmed Member**
- 7 labeled **Inactive**
- 2 labeled **Prospect / Follow Up**
- 22 with follow-up status **Confirmed**
- 6 **Not Joining**, 3 **Awaiting Reply**, 1 **New**
- 29 with a usable student name; some names and identities are incomplete.
- 30 with a parent/guardian name.
These are spreadsheet values, not verified live student statuses.

## Fields in Roster
Source Row; Roster Category; Follow-up Status; Student Name; Birth Date; Reported Age; Current Age; Parent / Guardian; Student Email; Student Cell; Parent 1 Email; Parent 1 Cell; Parent 2 Name; Parent 2 Email; Parent 2 Cell; Address; Mayhem Email; Dues Paid; Mayhem Release; Emergency Medical; Media Waiver; WireBelt Release; FIRST Registered; FIRST Release; T-Shirt Sleeve; T-Shirt Qty; T-Shirt Size; Sweatshirt; Payment / Order Notes; Core Complete %; Records Missing; Next Action; Notes.

## Target mapping — proposed permanent-team/season architecture
| Source | Target | Import interpretation |
| --- | --- | --- |
| Student Name | students | Parse carefully; preserve original full name; don't auto-merge incomplete identities |
| Birth Date | students | Date of birth; optional; restricted access |
| Student Email, Student Cell, Mayhem Email | student contacts | Separate channels and provisioned-email flag |
| Parent / Guardian, Parent 2 Name, emails, cells, Address | guardians, households, student_households | Household deduplication and guardian relationships require review |
| Roster Category, Follow-up Status | season enrollments | Preserve source status and follow-up separately from actual participation |
| Dues Paid | annual dues | Yes/No/unknown alone does not prove a payment amount; don't infer dollars |
| Mayhem Release, Emergency Medical, Media Waiver, WireBelt Release, FIRST Release | annual requirements | Map Yes to received, No to pending, Unknown/blank to unknown/pending; never infer signed documents |
| FIRST Registered | annual FIRST registration | Map Yes/No/Unknown separately |
| T-Shirt Sleeve, Qty, Size, Sweatshirt | apparel order | Preserve as season-related apparel fields (do not discard) |
| Payment / Order Notes, Next Action, Notes | follow-up / audit notes | Preserve text; restrict sensitive notes where necessary |
| Core Complete %, Records Missing | derived dashboard metrics | Recalculate rather than persist spreadsheet formulas |

## Data quality cautions
- Rows with missing or placeholder student identities must be held for manual review.
- Same names may not mean the same person. Household contact data and date of birth should help with controlled matching.
- Survey Review documents corrections and unmatched responses; use Roster as the primary current-season source and review conflicts before committing.
- Do not automatically infer 2025-2026 participation from historical registration responses without verification.
- Avoid transforming Unknown into No or received.
- FIRST Registered and FIRST Release are distinct fields; preserve both.
- In the source, many dues values say No and none of these indicate paid dollar amounts; do not invent payment totals.
- Current date and spreadsheet's age calculation may differ; recompute ages from normalized birth dates when needed.

## Safe import approach (not yet implemented)
1. Finish permanent `teams` / `team_seasons` / `enrollments` schema migration, preserving existing test data.
2. Add optional student contact, DOB, apparel/follow-up fields and granular access controls.
3. Complete authorized/unauthorized account tests and backups before any real data transfer.
4. Implement local browser XLSX parser with preview; source workbook never goes to GitHub.
5. Display record-level decisions: insert, update existing, hold for review; don't blindly deduplicate by name.
6. Confirm the target season is **2026-2027**, team number **8724**, program **FRC**.
7. Import in auditable batches with idempotent source identifiers, per-row error handling, and rollback/retry guidance.
8. Show reconciliation counts after import (created/updated/skipped/review/errors).

**Status:** Source inspected and mappings documented. **No real student records have been imported into Supabase**. This is intentional until the schema and security work are complete.
