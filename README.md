# OCR Indexer Monorepo

This repository contains indexer implementations for the OCR (Open Creator Rails) protocol on the Ethereum network.

The project is structured as a monorepo with multiple indexer implementations to support different tech stacks and requirements.

## Directory Structure

### 1. [ponder](./ponder)
**Framework:** [Ponder](https://ponder.sh)  

The primary indexer moving forward. Ponder offers improved developer experience, strict TypeScript typing, and a simpler deployment model (Node.js runtime).

- **Database:** PostgreSQL (Pglite for dev)
- **Language:** TypeScript
- **Features:** Dynamic contract indexing, Factory pattern support

### 2. [envio](./envio)
**Framework:** [Envio](https://envio.dev)

The original indexer implementation using Envio.

- **Database:** PostgreSQL
- **Language:** TypeScript / ReScript (Internal)
- **Features:** High-performance indexing via HyperIndex

## Quick Start

Navigate to the specific indexer directory to run it.

**For Ponder:**
```bash
cd ponder
pnpm install
pnpm dev
# GraphQL available at http://localhost:42069
```

**For Envio:**
```bash
cd envio
pnpm install
pnpm dev
# GraphQL available at http://localhost:8080
```
