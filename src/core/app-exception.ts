import { HttpStatus } from './http-status';

// 예외에는 에러 상태 코드(4xx/5xx)만 허용
export type ErrorStatus = Exclude<HttpStatus, 200 | 201 | 204>;

export class AppException extends Error {
  constructor(
    message: string,
    public readonly status: ErrorStatus,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class BadRequestException extends AppException {
  constructor(message = 'Bad Request') {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class UnauthorizedException extends AppException {
  constructor(message = 'Unauthorized') {
    super(message, HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenException extends AppException {
  constructor(message = 'Forbidden') {
    super(message, HttpStatus.FORBIDDEN);
  }
}

export class NotFoundException extends AppException {
  constructor(message = 'Not Found') {
    super(message, HttpStatus.NOT_FOUND);
  }
}

export class ConflictException extends AppException {
  constructor(message = 'Conflict') {
    super(message, HttpStatus.CONFLICT);
  }
}
