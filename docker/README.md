# Docker Setup for E2E Testing

This directory contains Docker configuration for running PostgreSQL database for E2E testing.

## Starting the Database

```bash
cd docker
docker-compose up -d
```

## Stopping the Database

```bash
cd docker
docker-compose down
```

## Database Configuration

- **Host**: localhost
- **Port**: 5432
- **Database**: testdb
- **User**: testuser
- **Password**: testpassword

## Initial Setup

The `init.sql` script creates a `my_table` table with sample data:
- 4 sample records
- Columns: id, name, age, email, active, created_at

## Connecting to Database

You can connect using:
1. Connection string: `postgres://testuser:testpassword@localhost:5432/testdb`
2. Individual parameters: driver=postgres, host=localhost, port=5432, user=testuser, password=testpassword, database=testdb

## Verifying Setup

```bash
# Check container is running
docker ps | grep e2e-test-postgres

# Connect to database
docker exec -it e2e-test-postgres psql -U testuser -d testdb -c "SELECT * FROM my_table;"
```
