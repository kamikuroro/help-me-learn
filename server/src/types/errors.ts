export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
    public isOperational: boolean = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class SourceNotFoundError extends AppError {
  constructor(sourceId: number) {
    super(`Source ${sourceId} not found`, 404, 'SOURCE_NOT_FOUND');
  }
}

export class ConversationNotFoundError extends AppError {
  constructor(conversationId: number) {
    super(`Conversation ${conversationId} not found`, 404, 'CONVERSATION_NOT_FOUND');
  }
}

export class DuplicateSourceError extends AppError {
  constructor(url: string, existingId: number) {
    super(`URL already ingested as source ${existingId}`, 409, 'DUPLICATE_SOURCE');
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string) {
    super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR');
  }
}

export class IngestionFailedError extends AppError {
  constructor(sourceId: number, step: string, reason: string) {
    super(`Ingestion failed for source ${sourceId} at step ${step}: ${reason}`, 500, 'INGESTION_FAILED');
  }
}

export class BookNotFoundError extends AppError {
  constructor(bookId: number) {
    super(`Book ${bookId} not found`, 404, 'BOOK_NOT_FOUND');
  }
}

export class ChapterNotFoundError extends AppError {
  constructor(chapterId: number) {
    super(`Chapter ${chapterId} not found`, 404, 'CHAPTER_NOT_FOUND');
  }
}

export class EpisodeNotFoundError extends AppError {
  constructor(episodeId: number) {
    super(`Episode ${episodeId} not found`, 404, 'EPISODE_NOT_FOUND');
  }
}
