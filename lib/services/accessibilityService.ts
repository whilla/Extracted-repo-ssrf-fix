

import { aiService } from './aiService';
import { kvGet } from './puterService';

export interface AccessibilityResult {
  altText: string;
  seoKeywords: string[];
  accessibilityScore: number; // 0-100
  suggestions: string[];
}

/**
 * AccessibilityService provides tools to make AI generated content 
 * inclusive and SEO-friendly.
 */
export const accessibilityService = {
  /**
   * Generates a high-quality ALT text for an image based on its URL 
   * and the prompt used to create it.
   */
  async generateAltText(imageUrl: string, originalPrompt: string): Promise<AccessibilityResult> {
    try {
      const brandKit = await kvGet('brand_kit');
      const brandContext = brandKit ? JSON.stringify(brandKit) : 'No specific brand kit defined.';

      const systemPrompt = `
        You are an expert in Web Accessibility (WCAG 2.1) and SEO. 
        Your task is to provide a highly descriptive, inclusive, and SEO-optimized ALT text for an AI-generated image.
        
        GUIDELINES:
        1. Be objective: Describe what is actually in the image.
        2. Be concise but descriptive: Avoid "image of..." or "picture of...".
        3. Contextualize: Use the provided original prompt and brand context to ensure the description aligns with the intent.
        4. SEO: Naturally integrate 2-3 relevant keywords.
        5. Accessibility: Ensure a visually impaired user can fully understand the image's purpose and content.
      `;

      const userPrompt = `
        Original Generation Prompt: "${originalPrompt}"
        Image URL: ${imageUrl}
        Brand Context: ${brandContext}

        Please provide the following in JSON format:
        {
          "altText": "The final optimized ALT text",
          "seoKeywords": ["keyword1", "keyword2", "keyword3"],
          "accessibilityScore": 0-100,
          "suggestions": ["Any tips to improve the image for accessibility"]
        }
      `;

      // Use vision-capable chat (passing image_url in the content array)
      const response = await aiService.chat([
        { role: 'system', content: systemPrompt },
        { 
          role: 'user', 
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: imageUrl } }
          ] 
        }
      ]);

      // The response should be JSON. We'll attempt to parse it.
      // Cleaning response in case the AI wrapped it in ```json ... ```
      const cleanedResponse = response.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanedResponse) as AccessibilityResult;

    } catch (error) {
      console.error('[AccessibilityService] Error generating alt text:', error);
      // Fallback: Provide a basic alt text based on the prompt if vision fails
      return {
        altText: originalPrompt.slice(0, 125),
        seoKeywords: [],
        accessibilityScore: 50,
        suggestions: ['Vision analysis failed, using prompt fallback.'],
      };
    }
  },

  /**
   * Checks if a piece of content meets basic accessibility standards.
   */
  async validateAccessibility(content: any): Promise<{ passed: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    if (!content.altText) {
      issues.push('Missing ALT text for image.');
    }
    
    if (content.text && content.text.length > 2000) {
      issues.push('Text block is too long for optimal screen-reader consumption.');
    }

    return {
      passed: issues.length === 0,
      issues,
    };
  }
};
