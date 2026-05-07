#!/bin/bash

# NexusAI Autonomous Engine Setup Script
echo "🚀 Starting NexusAI Autonomous Engine Setup..."

# 1. Environment Setup
if [ ! -f .env ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo "⚠️ Please edit the .env file and add your API keys before continuing."
    exit 1
fi

# 2. Database Migration
echo "Applying Supabase vector migrations..."
# In a real scenario, this would use supabase db push
# For now, we instruct the user to run the SQL in the Supabase Dashboard
echo "👉 Please run the SQL in: /supabase/schema.sql in your Supabase SQL Editor."

# 3. Docker Deployment
echo "Launching containers via Docker Compose..."
docker-compose up -d --build

echo "✅ System is deploying!"
echo "--------------------------------------------------"
echo "🌐 Next.js App: http://localhost:3000"
echo "⚙️  n8n Engine: http://localhost:5678"
echo "--------------------------------------------------"
echo "Next steps:"
echo "1. Login to n8n and set up your credentials."
echo "2. Create workflows based on /docs/n8n_workflows_spec.md."
echo "3. Use the Agent Creator to assign tools to your AI agents."
