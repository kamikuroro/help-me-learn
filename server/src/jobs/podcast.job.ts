import { JobQueue } from './queue.js';
import { generateEpisode } from '../services/podcast.service.js';
import { logger } from '../logger.js';

interface PodcastJobData {
  episodeId: number;
}

export const podcastQueue = new JobQueue(
  'podcast',
  async (data: PodcastJobData) => {
    logger.info({ event: 'podcast_generate_start', episode_id: data.episodeId });
    await generateEpisode(data.episodeId);
  },
  1,
);
