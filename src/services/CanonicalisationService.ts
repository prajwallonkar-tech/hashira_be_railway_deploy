import { hashSHA256 } from '../utils/crypto';

export class CanonicalisationService {
  canonicalise(event: {
    prompt: string;
    output: string;
    model_id: string;
    timestamp: string;
    workflow_id?: string | null;
    metadata?: Record<string, unknown> | null;
  }): string {
    const obj: Record<string, unknown> = {
      model_id: event.model_id,
      output: event.output,
      prompt: event.prompt,
      timestamp: new Date(event.timestamp).toISOString(),
    };

    if (event.workflow_id != null) {
      obj['workflow_id'] = event.workflow_id;
    }

    if (event.metadata != null) {
      obj['metadata'] = event.metadata;
    }

    return JSON.stringify(this.sortKeysRecursive(obj));
  }

  hash(canonicalString: string): string {
    return hashSHA256(canonicalString);
  }

  private sortKeysRecursive(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortKeysRecursive(item));
    }
    if (value !== null && typeof value === 'object') {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[key] = this.sortKeysRecursive(
          (value as Record<string, unknown>)[key],
        );
      }
      return sorted;
    }
    return value;
  }
}
