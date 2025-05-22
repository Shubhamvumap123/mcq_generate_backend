import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createExpressServer } from 'routing-controllers';
import { VideoController } from './controllers/VideoController';
import { TranscriptionController } from './controllers/TranscriptionController';
import { QuestionController } from './controllers/QuestionController';
import { connectDatabase } from './config/database';
import { ErrorHandler } from './middleware/errorHandler';

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 500 * 1024 * 1024, // 500MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'video/mp4',
            'video/avi',
            'video/mov',
            'video/wmv',
            'video/flv',
            'audio/mp3',
            'audio/wav',
            'audio/m4a'
        ];
        
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only video and audio files are allowed.'));
        }
    }
});

async function startServer() {
    try {
        // Connect to MongoDB
        await connectDatabase();
        
        // Create Express server with routing-controllers
        const app = createExpressServer({
            controllers: [VideoController, TranscriptionController, QuestionController],
            middlewares: [ErrorHandler],
            cors: true,
            defaultErrorHandler: false,
        });
        
        // Additional middleware
        app.use(cors());
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        
        // Make uploads directory accessible
        app.use('/uploads', express.static(uploadsDir));
        
        // Add multer middleware globally for file uploads
        app.use('/api/videos/upload', upload.single('video'));
        
        // Health check endpoint
        app.get('/health', (req: any, res: { json: (arg0: { status: string; message: string; }) => void; }) => {
            res.json({ status: 'OK', message: 'Server is running' });
        });
        
        // Start server
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`🚀 Server is running on port ${PORT}`);
            console.log(`📁 Uploads directory: ${uploadsDir}`);
            console.log(`🔗 Health check: http://localhost:${PORT}/health`);
        });
        
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();