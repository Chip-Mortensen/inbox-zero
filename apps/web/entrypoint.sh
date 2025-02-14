#!/bin/sh

# Install dependencies
pnpm install

# Wait for database to be ready
echo "Waiting for database to be ready..."
sleep 5

# Run migrations
pnpm prisma generate
pnpm prisma migrate deploy

# Start the application
pnpm run dev