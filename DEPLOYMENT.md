# Deployment Guide

## Required Environment Variables

Your deployment is failing because required environment variables are not set. You need to configure these in your deployment platform:

### Essential Variables (Required)

```env
# Database Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-supabase-anon-public-key

# OpenAI Configuration  
OPENAI_API_KEY=sk-your-openai-api-key

# Security (Production)
JWT_SECRET=your-super-secret-jwt-key-change-this
```

### Optional Variables

```env
# Server
PORT=3000
NODE_ENV=production
HOST=0.0.0.0

# AI Settings
AI_MODEL=gpt-4o
AI_TEMPERATURE=0.3
AI_MAX_TOKENS=800

# Security
ALLOWED_ORIGINS=https://yourdomain.com
SESSION_SECRET=your-session-secret

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=20
RATE_LIMIT_WINDOW_MS=60000

# Feature Flags
ENABLE_STREAMING=true
ENABLE_ANALYTICS=true
ENABLE_CACHING=true
```

## Platform-Specific Setup

### Docker/Container Deployment
Set environment variables in your docker-compose.yml or container configuration:

```yaml
environment:
  - SUPABASE_URL=https://your-project.supabase.co
  - SUPABASE_KEY=your-key
  - OPENAI_API_KEY=sk-your-key
  - NODE_ENV=production
```

### Heroku
```bash
heroku config:set SUPABASE_URL=https://your-project.supabase.co
heroku config:set SUPABASE_KEY=your-key
heroku config:set OPENAI_API_KEY=sk-your-key
heroku config:set NODE_ENV=production
```

### Vercel
In your Vercel dashboard or via CLI:
```bash
vercel env add SUPABASE_URL
vercel env add SUPABASE_KEY  
vercel env add OPENAI_API_KEY
vercel env add NODE_ENV
```

### Railway
```bash
railway variables set SUPABASE_URL=https://your-project.supabase.co
railway variables set SUPABASE_KEY=your-key
railway variables set OPENAI_API_KEY=sk-your-key
railway variables set NODE_ENV=production
```

### DigitalOcean App Platform
In your app spec or dashboard, add environment variables in the settings.

## Getting Your Keys

### Supabase
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to Settings > API
4. Copy your `URL` and `anon/public` key

### OpenAI
1. Go to [OpenAI API Keys](https://platform.openai.com/api-keys)
2. Create a new secret key
3. Copy the key (starts with `sk-`)

## Troubleshooting

If you're still getting the "supabaseUrl is required" error:

1. **Verify Environment Variables**: Check your deployment platform's environment variable settings
2. **Check Variable Names**: Ensure exact spelling: `SUPABASE_URL` (not `SUPABASE_URI` or similar)
3. **Restart Deployment**: After setting variables, redeploy your application
4. **Check Logs**: Look for the detailed error messages showing which variables are missing

## Local Development

For local development, create a `.env` file in the root directory:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key
OPENAI_API_KEY=sk-your-openai-key
NODE_ENV=development
PORT=3000
```

## Support

If you continue having issues:
1. Check the application logs for detailed error messages
2. Verify your Supabase project is active and accessible
3. Confirm your OpenAI API key has sufficient credits
