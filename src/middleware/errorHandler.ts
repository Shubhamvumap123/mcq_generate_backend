import { Request, Response, NextFunction } from 'express';
import { Middleware, ExpressErrorMiddlewareInterface } from 'routing-controllers';

@Middleware({ type: 'after' })
export class ErrorHandler implements ExpressErrorMiddlewareInterface {
    error(error: any, request: Request, response: Response, next: NextFunction): void {
        console.error('Error occurred:', {
            message: error.message,
            stack: error.stack,
            url: request.url,
            method: request.method,
            timestamp: new Date().toISOString()
        });

        // Default error response
        let statusCode = 500;
        let errorMessage = 'Internal Server Error';
        let errorCode = 'INTERNAL_ERROR';

        // Handle different types of errors
        if (error.httpCode) {
            statusCode = error.httpCode;
            errorMessage = error.message;
        } else if (error.name === 'ValidationError') {
            statusCode = 400;
            errorMessage = 'Validation Error';
            errorCode = 'VALIDATION_ERROR';
        } else if (error.name === 'CastError') {
            statusCode = 400;
            errorMessage = 'Invalid ID format';
            errorCode = 'INVALID_ID';
        } else if (error.code === 11000) {
            statusCode = 409;
            errorMessage = 'Duplicate entry';
            errorCode = 'DUPLICATE_ENTRY';
        } else if (error.name === 'MongooseError') {
            statusCode = 500;
            errorMessage = 'Database error';
            errorCode = 'DATABASE_ERROR';
        } else if (error.message) {
            errorMessage = error.message;
        }

        // File upload specific errors
        if (error.code === 'LIMIT_FILE_SIZE') {
            statusCode = 413;
            errorMessage = 'File too large';
            errorCode = 'FILE_TOO_LARGE';
        } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            statusCode = 400;
            errorMessage = 'Unexpected file field';
            errorCode = 'UNEXPECTED_FILE';
        }

        response.status(statusCode).json({
            success: false,
            error: {
                code: errorCode,
                message: errorMessage,
                timestamp: new Date().toISOString(),
                path: request.url
            }
        });
    }
}

export const errorHandler = new ErrorHandler();