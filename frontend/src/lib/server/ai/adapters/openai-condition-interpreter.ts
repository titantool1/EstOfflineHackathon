import 'server-only';
import OpenAI from 'openai';
import { AiError } from '../contracts.ts';
import { interpretationPrompt, interpretationSchema, type ConditionInterpreter } from '../application/condition-interpretation.ts';
export function createConditionInterpreter(options: { apiKey: string; model: string; fetch?: typeof fetch }): ConditionInterpreter {
 return async (input, signal) => {
  if (!options.apiKey.trim()) throw new AiError('MODEL_NOT_CONFIGURED');
  try {
   const client = new OpenAI({ apiKey: options.apiKey, timeout: 45000, maxRetries: 0, fetch: options.fetch });
   const result = await client.responses.create({ model: options.model, store: false, instructions: interpretationPrompt,
    input: JSON.stringify(input), reasoning: { effort: 'low' }, max_output_tokens: 2200,
    text: { format: { type: 'json_schema', name: 'condition_interpretation', strict: true, schema: interpretationSchema } } }, { signal });
   if (result.status !== 'completed' || !result.output_text) throw new AiError('MODEL_INCOMPLETE');
   return JSON.parse(result.output_text) as unknown;
  } catch (error) {
   if (error instanceof AiError) throw error;
   throw new AiError(signal.aborted ? 'AI_CANCELLED' : 'CONDITION_INTERPRETATION_FAILED');
  }
 };
}
