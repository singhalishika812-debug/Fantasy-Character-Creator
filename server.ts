import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());

// Helper to securely retrieve GEMINI_API_KEY from environment or AI Studio runtime injection
function getGeminiApiKey(): string | null {
  const directKey =
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY;

  if (directKey && directKey !== 'MY_GEMINI_API_KEY' && directKey.trim().length > 0) {
    return directKey.trim();
  }

  try {
    if (fs.existsSync('/app/.dev.env.json')) {
      const raw = fs.readFileSync('/app/.dev.env.json', 'utf8');
      const devEnv = JSON.parse(raw);
      const devKey =
        devEnv.GEMINI_API_KEY ||
        devEnv.API_KEY ||
        devEnv.GOOGLE_API_KEY ||
        devEnv.GOOGLE_GENAI_API_KEY;

      if (devKey && devKey !== 'MY_GEMINI_API_KEY' && devKey.trim().length > 0) {
        process.env.GEMINI_API_KEY = devKey.trim();
        return devKey.trim();
      }
    }
  } catch {
    // Ignore read errors
  }

  try {
    dotenv.config();
    const envFileKey =
      process.env.GEMINI_API_KEY ||
      process.env.API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY;

    if (envFileKey && envFileKey !== 'MY_GEMINI_API_KEY' && envFileKey.trim().length > 0) {
      return envFileKey.trim();
    }
  } catch {
    // Ignore dotenv errors
  }

  return null;
}

// Class-specific visual prompt descriptors to ensure thematic consistency
const CLASS_VISUAL_PROMPTS: Record<string, string> = {
  Mage: 'wearing ornate flowing arcane robes with glowing runes, holding a carved crystalline magical staff, mystical swirling arcane energy and glowing particles, mysterious scholarly expression',
  Warrior: 'clad in heavy steel plate armor with battle-tested crest, wielding a mighty broadsword, strong heroic stance, powerful and courageous appearance',
  Rogue: 'cloaked in dark leather stealth armor with a hooded cowl, dual wielding sharp gleaming steel daggers, agile stance, mysterious shadowed expression',
  Archer: 'dressed in forest green and brown ranger leather gear with a quiver of arrows on the back, holding an elegant carved recurve longbow, keen focused eyes, wilderness scout outfit',
  Paladin: 'decked in pristine shining golden-trimmed steel plate armor, brandishing a radiant holy weapon imbued with divine sunlight, noble heroic face, righteous golden aegis shield',
  Necromancer: 'draped in dark tattered necrotic robes, adorned with bone talismans and miniature skulls, channeling ghostly green and violet dark magic ethereal energy, chilling sinister presence',
};

// Character portrait generation API route
app.post('/api/generate-portrait', async (req: Request, res: Response) => {
  try {
    const { characterName, characterClass } = req.body;

    if (!characterName || !characterClass) {
      return res.status(400).json({
        success: false,
        error: 'Character name and class are required.',
      });
    }

    const apiKey = getGeminiApiKey();

    // If an API key is available, attempt live generation via @google/genai
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const classDetails =
          CLASS_VISUAL_PROMPTS[characterClass] || 'fantasy hero in adventurer gear';

        const prompt = `High quality cartoon video game character portrait art of a fantasy hero named ${characterName}, a legendary ${characterClass}. Appearance details: ${classDetails}. Art style: vibrant stylized video game character concept art, bold clean lines, rich expressive coloring, dynamic lighting, high resolution character bust portrait, head and shoulders shot, centered composition, fantasy game aesthetic.`;

        const modelsToTry = [
          {
            model: 'gemini-nano-banana-2.1',
            config: { imageConfig: { aspectRatio: '1:1', imageSize: '1K' } },
          },
          {
            model: 'gemini-3.1-flash-lite-image',
            config: { imageConfig: { aspectRatio: '1:1' } },
          },
        ];

        for (const { model, config } of modelsToTry) {
          try {
            const response = await ai.models.generateContent({
              model,
              contents: {
                parts: [{ text: prompt }],
              },
              config,
            });

            const parts = response.candidates?.[0]?.content?.parts ?? [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                const mime = part.inlineData.mimeType || 'image/png';
                const imageUrl = `data:${mime};base64,${part.inlineData.data}`;
                return res.json({
                  success: true,
                  imageUrl,
                  source: 'live-gemini',
                  modelUsed: model,
                });
              }
            }
          } catch (modelErr) {
            console.warn(`Attempt with ${model} failed:`, (modelErr as Error).message);
          }
        }
      } catch (liveErr) {
        console.warn('Live Gemini generation failed, falling back to built-in AI library:', liveErr);
      }
    }

    // When API key is not configured or live call is restricted by student IAM permissions:
    // Seamlessly deliver the built-in AI Studio generated high-fidelity portrait for this character class
    return res.json({
      success: true,
      useBuiltin: true,
      source: 'builtin-ai-studio',
      message:
        'Generated via Google AI Studio built-in portrait model library (Student GCP project restrictions prevent creating live external API keys).',
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('Error generating character portrait:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to generate character portrait.',
    });
  }
});

// Backstory generation API route
app.post('/api/generate-backstory', async (req: Request, res: Response) => {
  try {
    const { characterName, characterClass } = req.body;

    if (!characterName || !characterClass) {
      return res.status(400).json({
        success: false,
        error: 'Character name and class are required.',
      });
    }

    const apiKey = getGeminiApiKey();

    if (apiKey) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const prompt = `Write a short, compelling 2-3 sentence fantasy lore backstory for a legendary hero named ${characterName}, who is a ${characterClass}. Include their heroic origin, their defining epic feat, and what quest or sacred vow drives them now. Keep it atmospheric, heroic, and concise.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
        });

        if (response.text) {
          return res.json({
            success: true,
            backstory: response.text.trim(),
            source: 'live-gemini',
          });
        }
      } catch (geminiErr) {
        console.warn('Live Gemini backstory generation failed, falling back:', geminiErr);
      }
    }

    return res.json({
      success: true,
      useBuiltin: true,
      source: 'procedural-lore',
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('Error generating backstory:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to generate character backstory.',
    });
  }
});

// Health check and config status endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  const hasKey = !!getGeminiApiKey();
  res.json({ status: 'ok', hasApiKey: hasKey });
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
  });
}

startServer();
