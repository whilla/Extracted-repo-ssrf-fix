# NexusAI API Reference

## Overview

NexusAI provides RESTful APIs for content generation, publishing, analytics, CRM, and compliance. All API endpoints require authentication (Supabase session) and have rate limiting enabled (60 req/min default).

## Authentication

All API requests require a valid Supabase session cookie (set automatically by the middleware on login). API routes return `401 Unauthorized` if no valid session is present.

## Rate Limiting

- Default: 60 requests per minute per IP
- Responses include `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers
- Returns `429 Too Many Requests` when exceeded

---

## E-Commerce Publishing

### POST /api/ecommerce/shopify
Publish content as a Shopify product.

**Request Body:**
```json
{
  "content": "Product description HTML",
  "title": "Product Title",
  "productId": "optional-existing-product-id"
}
```

**Response:**
```json
{
  "success": true,
  "postId": "gid://shopify/Product/123",
  "url": "https://your-store.myshopify.com/products/product-title"
}
```

### POST /api/ecommerce/amazon
Publish content to Amazon product listings via Selling Partner API.

**Request Body:**
```json
{
  "content": "Product description",
  "title": "Product Title",
  "category": "optional-category"
}
```

**Response:**
```json
{
  "success": true,
  "postId": "SKU123",
  "url": "https://www.amazon.com/dp/SKU123"
}
```

### POST /api/ecommerce/etsy
Publish content as an Etsy listing.

**Request Body:**
```json
{
  "content": "Listing description",
  "title": "Listing Title",
  "category": "optional-category"
}
```

**Response:**
```json
{
  "success": true,
  "postId": "123456789",
  "url": "https://www.etsy.com/listing/123456789"
}
```

---

## Content Intelligence

### POST /api/predictive
Predict content performance before publishing.

**Request Body:**
```json
{
  "content": "Your content text",
  "platform": "instagram",
  "contentType": "text",
  "hashtags": ["#ai", "#tech"],
  "topic": "AI technology"
}
```

**Response:**
```json
{
  "success": true,
  "prediction": {
    "predictedEngagement": 4.5,
    "confidence": 0.85,
    "viralPotential": 72,
    "viralProbability": "high",
    "estimatedReach": 72000,
    "platform": "instagram"
  },
  "scheduling": { "bestDays": ["Wednesday", "Friday"], "bestTimes": ["9:00 AM", "7:00 PM"] },
  "contentTips": ["Add an emotional hook in the first 3 words"]
}
```

### POST /api/audience
Analyze audience behavior across platforms.

**Request Body:**
```json
{
  "platform": "instagram"
}
```

**Response:**
```json
{
  "success": true,
  "segments": [{ "id": "seg_1", "name": "Tech Enthusiasts", "size": 15000, "behaviorScore": 85 }],
  "insights": { "mostEngagedSegment": "Creative Professionals" },
  "recommendations": ["Create segment-specific content for high-value audiences"]
}
```

### POST /api/intel/competitive
Analyze competitors and identify content gaps.

**Request Body:**
```json
{
  "competitorNames": ["CompetitorA", "CompetitorB"],
  "platform": "instagram",
  "type": "analyze"
}
```

**Response:**
```json
{
  "success": true,
  "competitors": [{ "name": "CompetitorA", "followers": 250000, "engagement": 3.2 }],
  "gaps": [{ "area": "Video Content", "opportunity": "Increase video production" }],
  "recommendations": ["Increase video content by 30%"]
}
```

### POST /api/intel/analyze
Deep competitive intelligence analysis by URL or competitor names.

---

## Content Generation

### POST /api/interactive
Generate interactive content (quizzes, polls, calculators, infographics, mini-games).

**Request Body:**
```json
{
  "type": "quiz",
  "title": "Marketing Knowledge Quiz",
  "questions": [
    { "question": "What is SEO?", "options": ["A", "B", "C", "D"], "correctIndex": 0 }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "embedUrl": "https://embed.nexusai.io/quiz/123456",
  "html": "<div class=\"quiz\">..."
}
```

Supported types: `infographic`, `mini_game`, `calculator`, `quiz`, `poll`

### POST /api/spatial/models
Generate 3D models from text prompts.

**Request Body:**
```json
{
  "prompt": "A futuristic chair with neon lighting",
  "style": "realistic",
  "outputFormat": "glb"
}
```

Supported styles: `realistic`, `cartoon`, `abstract`, `low_poly`
Supported formats: `glb`, `gltf`, `usdz`, `aframe`

### POST /api/spatial/ar-filters
Generate AR filters for social platforms.

**Request Body:**
```json
{
  "effectName": "Neon Glow",
  "trigger": "face",
  "intensity": 1
}
```

### POST /api/spatial/vr-environments
Generate VR environments.

**Request Body:**
```json
{
  "sceneType": "room",
  "lighting": "day",
  "interactiveElements": []
}
```

---

## Data Visualization

### POST /api/data/visualization
Generate charts from CSV data.

**Request Body:**
```json
{
  "csvData": "Category,Value\nProduct A,45\nProduct B,32\nProduct C,67",
  "chartType": "bar",
  "title": "Product Performance"
}
```

Available chart types: `bar`, `line`, `pie`, `area`, `scatter`, `donut`, `radar`

### GET /api/data/visualization
List available chart types with examples.

### POST /api/data/comparison
Generate comparison charts.

**Request Body:**
```json
{
  "csvData": "Category,Value\nProduct A,45\nProduct B,32",
  "categories": ["Product A", "Product B"],
  "title": "Comparison"
}
```

---

## Compliance

### POST /api/compliance/filter
Filter content for regional compliance.

**Request Body:**
```json
{
  "content": "Your content here",
  "regions": ["us", "eu", "de"]
}
```

Supported regions: `us`, `eu`, `uk`, `ca`, `au`, `jp`, `cn`, `in`, `br`, `de`, `fr`, `es`

### GET /api/compliance/region
List all supported regions with their restrictions.

### POST /api/compliance/region
Check content against a specific region.

---

## CRM

### POST /api/crm/segment
Create, update, or get segments.

**Request Body:**
```json
{
  "type": "create",
  "name": "High Value Customers",
  "criteria": { "engagementScore": 80 }
}
```

### GET /api/crm
Get all segments.

### POST /api/crm/customer
Create, update, track, or get customers.

**Request Body:**
```json
{
  "type": "create",
  "email": "user@example.com",
  "name": "John Doe",
  "source": "instagram"
}
```

### GET /api/crm/customer
Get customers (filter by `type` query param: `customers`, `high-value`, `aggregate`).

---

## System

### GET /api/features/status
List all implemented features with their status, auth, and rate limiting info.

**Response:**
```json
{
  "success": true,
  "totalFeatures": 12,
  "features": [
    { "id": "ecommerce-shopify", "name": "Shopify Integration", "auth": "enabled", "rateLimiting": "enabled" }
  ]
}
```

---

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

Common HTTP status codes:
- `400` - Bad Request (missing required fields)
- `401` - Unauthorized (no valid session)
- `429` - Rate Limited (too many requests)
- `500` - Internal Server Error
- `503` - Service Unavailable (Supabase not configured)
