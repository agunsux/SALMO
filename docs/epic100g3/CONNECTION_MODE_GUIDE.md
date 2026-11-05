# CONNECTION MODE ARCHITECTURE & PORT DISCIPLINE GUIDE

**Epic**: EPIC 100G.3 — Fresh Database Bootstrap, Migration Reconciliation & Recovery Validation  
**Document**: Phase F — Connection Mode Validation & Supavisor Architecture  
**Date**: November 5, 2026  
**Auditor**: Astra (Principal PostgreSQL Architect & Database Reliability Engineer)  
**Status**: **GUIDELINE SPECIFIED**  
**Production Recommendation**: **STRICTLY NO-GO (DEPLOYMENT HOLD)**  

---

## 1. Executive Summary

A frequent failure mode in cloud PostgreSQL architectures (particularly Supabase and AWS RDS Proxy) is attempting to execute DDL migrations or session-level operations over a **Transaction Mode connection pooler**.

This guide formalizes the connection mode matrix for SALMO, establishing clear operational boundaries between **Direct Connections (Port 5432)**, **Session Pooler Mode**, and **Transaction Pooler Mode (Port 6543 / Supavisor)**.

---

## 2. Connection Mode Operational Matrix

| Workload Type | Recommended Connection Mode | Port | Supported Features | Prohibited Features |
| :--- | :--- | :--- | :--- | :--- |
| **Schema Migrations & DDL Bootstrap** | **Direct Connection** (or Dashboard SQL Editor) | **5432** | Session locks, `CREATE EXTENSION`, multi-statement DDL, temporary tables, search path alters | Connection pooling for high concurrency |
| **Runtime Backend Pipelines (`dbClient.ts`)** | **Transaction Pooler** (Supavisor) | **6543** | High-throughput stateless queries, short transactions (`BEGIN ... COMMIT`), parameter binding | Prepared statements across transactions, `SET LOCAL`, session temp tables |
| **CI / Integration Test Suites** | **Direct Connection** (Local or Staging) | **5432** | Multi-client concurrency tests, isolated databases (`CREATE DATABASE`), advisory locks | Transaction pooling (causes pooler connection limit stalls) |
| **Administrative Inspection** | **Direct Connection** or **Dashboard** | **5432** / HTTP | `pg_stat_activity`, `VACUUM ANALYZE`, schema dumping (`pg_dump`) | N/A |

---

## 3. Technical Rationale: Why Transaction Poolers Fail on DDL

In Supabase, Port 6543 connects to **Supavisor** in Transaction Mode:
1. **Connection Reassignment**: As soon as a transaction commits or rolls back, the underlying backend PostgreSQL connection is returned to the pool and may be assigned to a completely different client.
2. **Session Parameter Loss**: Commands such as `SET search_path` or `SET statement_timeout` do not persist to subsequent transactions.
3. **Prepared Statement Collision**: Prepared statements created at the session level can cause `ERROR: prepared statement already exists` when connections are recycled.
4. **Advisory Lock Hazards**: Session-level advisory locks (`pg_advisory_lock`) remain held on the backend connection while the client disconnects, leading to catastrophic connection pool lock exhaustion.

---

## 4. Connection String Architecture in SALMO

### 4.1. Migration & Admin Connection String (Port 5432)
Used exclusively for running `FRESH_DATABASE_BOOTSTRAP.sql` and `pg_dump`:
```text
postgresql://postgres.[STAGING_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
```

### 4.2. Runtime Application Connection String (Port 6543)
Used by `src/repositories/dbClient.ts` in production and staging:
```text
postgresql://postgres.[STAGING_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

### 4.3. Local Development Connection String (Port 5432)
Used by local test suites and development daemons:
```text
postgresql://postgres@127.0.0.1:5432/salmo_test
```
