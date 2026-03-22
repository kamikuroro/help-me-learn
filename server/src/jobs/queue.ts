import { logger } from '../logger.js';

export type JobHandler = (data: any) => Promise<void>;

interface QueuedJob {
  id: string;
  data: any;
  status: 'pending' | 'active' | 'completed' | 'failed';
  error?: string;
  createdAt: Date;
}

export class JobQueue {
  private name: string;
  private handler: JobHandler;
  private concurrency: number;
  private active = 0;
  private pending: QueuedJob[] = [];
  private jobs = new Map<string, QueuedJob>();
  private idCounter = 0;

  constructor(name: string, handler: JobHandler, concurrency = 1) {
    this.name = name;
    this.handler = handler;
    this.concurrency = concurrency;
  }

  add(data: any): string {
    const id = `${this.name}-${++this.idCounter}`;
    const job: QueuedJob = {
      id,
      data,
      status: 'pending',
      createdAt: new Date(),
    };
    this.jobs.set(id, job);
    this.pending.push(job);
    this.processNext();
    return id;
  }

  getStatus(id: string): QueuedJob | undefined {
    return this.jobs.get(id);
  }

  getStats() {
    return {
      name: this.name,
      pending: this.pending.length,
      active: this.active,
      total: this.jobs.size,
    };
  }

  private async processNext(): Promise<void> {
    if (this.active >= this.concurrency || this.pending.length === 0) {
      return;
    }

    const job = this.pending.shift()!;
    job.status = 'active';
    this.active++;

    try {
      await this.handler(job.data);
      job.status = 'completed';
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      logger.error({ event: 'job_failed', queue: this.name, jobId: job.id, err: error });
    } finally {
      this.active--;
      this.processNext();
    }
  }

  /**
   * Wait for all active and pending jobs to complete (for graceful shutdown).
   */
  async drain(timeoutMs = 30_000): Promise<void> {
    const start = Date.now();
    while (this.active > 0 || this.pending.length > 0) {
      if (Date.now() - start > timeoutMs) {
        logger.warn({ queue: this.name }, 'Drain timeout reached');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}
