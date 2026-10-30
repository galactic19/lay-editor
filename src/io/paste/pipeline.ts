import type { PasteCleaner } from '../../core/types';

export type { PasteCleaner };

export class PastePipeline {
  constructor(private readonly cleaners: PasteCleaner[]) {}

  run(html: string): string {
    return this.cleaners.reduce((current, clean) => clean(current), html);
  }
}
