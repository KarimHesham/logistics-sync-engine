# Fincart Monorepo

This repository contains the source code for the Fincart project, a full-stack e-commerce solution managed as a monorepo.

## Table of Contents

- [Fincart Monorepo](#fincart-monorepo)
  - [Table of Contents](#table-of-contents)
  - [Project Setup](#project-setup)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
    - [Running the Project](#running-the-project)
  - [Architecture](#architecture)
    - [Overview](#overview)
    - [Apps](#apps)
      - [API (`apps/api`)](#api-appsapi)
      - [Web (`apps/web`)](#web-appsweb)
      - [Mock Shopify (`apps/mock-shopify`)](#mock-shopify-appsmock-shopify)
    - [Packages](#packages)
      - [DTOs (`packages/dtos`)](#dtos-packagesdtos)
  - [Database Schema](#database-schema)
    - [Prisma Models](#prisma-models)
  - [Chaos Testing](#chaos-testing)

---

## Project Setup

This project uses [pnpm](https://pnpm.io/) workspaces for dependency management.

### Prerequisites

- Node.js (>= 18)
- pnpm
- Docker (for PostgreSQL database)

### Installation

Install dependencies from the root directory:

```bash
pnpm install
```

### Running the Project

To run all applications (API, Web, Mock Shopify) concurrently in development mode:

```bash
pnpm dev
```

This will start:

- **API**: http://localhost:4000 (default)
- **Web**: http://localhost:3000 (default)
- **Mock Shopify**: Port configured in env

To build all packages and apps:

```bash
pnpm build
```

---

## Architecture

### Overview

The project is structured as a monorepo with strict boundaries between applications and shared packages.

### Apps

#### API (`apps/api`)

Built with **NestJS**, the backend service follows a module-driven architecture with a clear separation of concerns:

- **Modules** (`src/modules`): Feature-based modules containing Controllers, Services, and Utilities.
- **Data Access Layer** (`src/data-access`): Handles all database interactions.
  - **Repositories**: Encapsulate data access logic (Prisma/SQL).
  - **Entities**: Domain entities or Prisma model mappings.
- **Common** (`src/common`): Shared utilities and mappers.

**Key Principles:**

- Controllers return DTOs, never raw database entities.
- Services map repository results to DTOs using shared mappers.
- Utilities are stateless classes with static methods.

#### Web (`apps/web`)

Built with **Next.js**, the frontend application is organized by modules and containers:

- **Modules** (`src/modules`): Domain-specific logic, combining components, hooks, and API clients.
- **Containers** (`src/containers`): Screen-level components that compose module components and handle data wiring.

#### Mock Shopify (`apps/mock-shopify`)

A simulation service to mimic Shopify webhooks and APIs for testing ingestion and order processing flows.

### Packages

#### DTOs (`packages/dtos`)

A shared library containing Data Transfer Objects (DTOs) used by both the API and Web apps. This ensures type safety and consistency across the full stack.

- **Structure**: Grouped by domain (e.g., `orders`, `shipments`).
- **Separation**: Distinct `Request` and `Response` DTOs.

---

## Database Schema

The project uses **Prisma** with a PostgreSQL database. The schema is located at `apps/api/prisma/schema.prisma`.

### Prisma Models

- **Order** (`orders`): Represents a customer order. Contains core details like status, amount, and shipping address.
- **Shipment** (`shipments`): Tracking information for order shipments.
- **EventInbox** (`event_inbox`): Used for idempotent event ingestion. Stores raw events from external sources (like Shopify) before processing, ensuring data integrity and handling out-of-order delivery.

**Common Fields**:
All models typically include `createdAt`, `updatedAt`, and `deletedAt` for audit and soft-delete capabilities.

---

## Chaos Testing

Located in `scripts/chaos`, this tool simulates high-concurrency and out-of-order event scenarios to test the resilience of the system.

It validates:

- Idempotency of event processing.
- Correct order handling under load.
- System stability against duplicate or scrambled webhooks.

Run the chaos script via:

```bash
# Example command (refer to scripts/chaos/README.md or package.json for details)
pnpm filter scripts/chaos run start
```
