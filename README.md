# cblite-js-tests

Test suite for the [cblite-js](https://github.com/Couchbase-Ecosystem/cblite-js) library, including Docker setup for Couchbase Server and Sync Gateway.

## Overview

This repository contains test files for validating the cblite-js TypeScript interface definitions against real-world use cases. It includes a Docker-based testing environment with Couchbase Server and Sync Gateway for replicator tests.

The tests are designed to be injected into and executed in the example app ([react-native example app](https://github.com/Couchbase-Ecosystem/cbl-reactnative/tree/main/expo-example), [ionic example app](https://github.com/Couchbase-Ecosystem/cbl-ionic/tree/main/example)) rather than through a traditional test runner.

## Docker Environment Setup

### Prerequisites

- Docker and Docker Compose
- Git

### Starting the Docker Environment

1. Start the Docker containers for Couchbase Server and Sync Gateway:

```bash
docker-compose up -d
```

This will start:
- **Couchbase Server**: Available at http://localhost:8091
  - Username: Administrator
  - Password: P@$$w0rd12
- **Sync Gateway**: Available at http://localhost:4984/projects

### Container Details

Containers configuration based on [Tutorial - Set up Sync Gateway for use with Inventory Demo App](https://developer.couchbase.com/sync-gateway-setup), check for more configuration details.

#### Couchbase Server Container

- Ports: 8091-8096, 11210
- Pre-configured bucket: "projects" with sample data
- Automatically creates required indexes

#### Sync Gateway Container

- Ports: 4984-4986
- Pre-configured for sync with the "projects" bucket
- User accounts set up with team-based access control

### Stopping the Environment

```bash
docker-compose down
```

### Resetting the Environment

To completely reset the environment (removes all data):

```bash
docker-compose down -v
docker-compose up -d
```

## Sample Data

The Docker environment automatically imports sample project data into the Couchbase Server, including:
- Projects for different warehouses (Santa Clara, Houston, Jacksonville)
- Team-based access control
- Document structure with properties like name, description, createdBy, etc.

## Sync Gateway Configuration

The Sync Gateway is configured with:
- Channel-based sync based on team membership
- Document validation
- Import filtering for specific document types
- Access control based on team roles
---

## 📢 Support Policy

We truly appreciate your interest in this project!  
This project is **community-maintained**, which means it's **not officially supported** by our support team.

If you need help, have found a bug, or want to contribute improvements, the best place to do that is right here — by [opening a GitHub issue](https://github.com/Couchbase-Ecosystem/cblite-js-tests/issues).  
Our support portal is unable to assist with requests related to this project, so we kindly ask that all inquiries stay within GitHub.

Your collaboration helps us all move forward together — thank you!
