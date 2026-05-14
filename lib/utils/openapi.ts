/**
 * OpenAPI/Swagger documentation generator
 */

import { OpenAPIV3 } from 'openapi-types';

const baseOpenApiDoc: OpenAPIV3.Document = {
  openapi: '3.0.0',
  info: {
    title: 'NexusAI API',
    description: 'AI-Powered Social Media Automation API',
    version: '1.0.0',
  },
  servers: [
    {
      url: 'https://api.nexusai.app',
      description: 'Production server',
    },
    {
      url: 'http://localhost:3000',
      description: 'Development server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          code: { type: 'string', nullable: true },
          details: { type: 'object', nullable: true },
        },
      },
    },
  },
  paths: {},
};

export function generateOpenApiSpec(): OpenAPIV3.Document {
  const doc = { ...baseOpenApiDoc };

  // Add API routes documentation
  doc.paths!['/api/ecommerce/shopify'] = {
    post: {
      tags: ['E-Commerce'],
      summary: 'Publish content to Shopify',
      description: 'Create or update Shopify products with AI-generated content',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                content: { type: 'string', description: 'Product description content' },
                title: { type: 'string', description: 'Product title' },
                productId: { type: 'string', description: 'Existing product ID for updates' },
              },
              required: ['content', 'title'],
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Success',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  postId: { type: 'string' },
                  url: { type: 'string' },
                  idempotencyKey: { type: 'string' },
                },
              },
            },
          },
        },
        400: { $ref: '#/components/schemas/ErrorResponse' },
        401: { $ref: '#/components/schemas/ErrorResponse' },
        500: { $ref: '#/components/schemas/ErrorResponse' },
      },
    },
  };

  doc.paths!['/api/interactive'] = {
    post: {
      tags: ['Content'],
      summary: 'Generate interactive content',
      description: 'Create infographics, mini-games, calculators, quizzes, and polls',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['infographic', 'mini_game', 'calculator', 'quiz', 'poll'],
                },
                title: { type: 'string' },
                data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string' },
                      value: { type: 'number' },
                      color: { type: 'string' },
                    },
                  },
                },
              },
              required: ['type'],
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Success',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  embedUrl: { type: 'string' },
                  html: { type: 'string' },
                  type: { type: 'string' },
                },
              },
            },
          },
        },
        400: { $ref: '#/components/schemas/ErrorResponse' },
        401: { $ref: '#/components/schemas/ErrorResponse' },
        500: { $ref: '#/components/schemas/ErrorResponse' },
      },
    },
  };

  doc.paths!['/api/predictive/analyze'] = {
    post: {
      tags: ['AI'],
      summary: 'Predict content performance',
      description: 'Analyze viral potential and engagement metrics for content',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                content: { type: 'string' },
                platform: {
                  type: 'string',
                  enum: ['instagram', 'tiktok', 'twitter', 'linkedin', 'facebook', 'youtube'],
                },
                contentType: {
                  type: 'string',
                  enum: ['video', 'image', 'text', 'carousel'],
                },
              },
              required: ['content'],
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Success',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  prediction: {
                    type: 'object',
                    properties: {
                      predictedEngagement: { type: 'number' },
                      confidence: { type: 'number' },
                      viralPotential: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
        400: { $ref: '#/components/schemas/ErrorResponse' },
        401: { $ref: '#/components/schemas/ErrorResponse' },
        500: { $ref: '#/components/schemas/ErrorResponse' },
      },
    },
  };

  // Add more routes as needed...

  return doc;
}

// API endpoint to serve OpenAPI spec
export async function GET() {
  const openApiSpec = generateOpenApiSpec();
  return new Response(JSON.stringify(openApiSpec, null, 2), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
