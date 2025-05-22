import { JsonController, Post, Get, Delete, Param, UploadedFile, Body, QueryParam } from 'routing-controllers';
import { Video, IVideo } from '../models/Video';
import { TranscriptionService } from '../services/TranscriptionService';
import { QuestionGenerationService } from '../services/QuestionGenerationService';
import fs from 'fs';
import path from 'path';

@JsonController('/api/videos')
export class VideoController {
    private transcriptionService = new TranscriptionService();
    private questionService = new QuestionGenerationService();

    @Post('/upload')
    async uploadVideo(@UploadedFile('video') file: Express.Multer.File): Promise<{ message: string; videoId: string; video: IVideo }> {
        try {
            if (!file) {
                throw new Error('No file uploaded');
            }

            // Create video record in database
            const video = new Video({
                filename: file.filename,
                originalName: file.originalname,
                filepath: file.path,
                size: file.size,
                mimetype: file.mimetype
            });

            await video.save();

            // Start background processing
            this.processVideoAsync(String(video._id));

            return {
                message: 'Video uploaded successfully',
                videoId: (video._id as string | number | undefined)?.toString() ?? '',
                video: video
            };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Upload failed: ${message}`);
        }
    }

    @Get('/')
    async getAllVideos(
        @QueryParam('status') status?: string,
        @QueryParam('limit') limit: number = 10,
        @QueryParam('skip') skip: number = 0
    ): Promise<{ videos: IVideo[]; total: number }> {
        try {
            const query: any = {};
            
            if (status) {
                query.transcriptionStatus = status;
            }

            const videos = await Video.find(query)
                .sort({ uploadedAt: -1 })
                .limit(limit)
                .skip(skip);

            const total = await Video.countDocuments(query);

            return { videos, total };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch videos: ${message}`);
        }
    }

    @Get('/:id')
    async getVideoById(@Param('id') id: string): Promise<IVideo> {
        try {
            const video = await Video.findById(id);
            if (!video) {
                throw new Error('Video not found');
            }
            return video;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch video: ${message}`);
        }
    }

    @Get('/:id/status')
    async getVideoStatus(@Param('id') id: string): Promise<{
        transcriptionStatus: string;
        questionGenerationStatus: string;
        segmentsCount: number;
        questionsCount: number;
    }> {
        try {
            const video = await Video.findById(id);
            if (!video) {
                throw new Error('Video not found');
            }

            return {
                transcriptionStatus: video.transcriptionStatus,
                questionGenerationStatus: video.questionGenerationStatus,
                segmentsCount: video.segments.length,
                questionsCount: video.questions.length
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch video status: ${message}`);
        }
    }

    @Delete('/:id')
    async deleteVideo(@Param('id') id: string): Promise<{ message: string }> {
        try {
            const video = await Video.findById(id);
            if (!video) {
                throw new Error('Video not found');
            }

            // Delete physical file
            if (fs.existsSync(video.filepath)) {
                fs.unlinkSync(video.filepath);
            }

            // Delete from database
            await Video.findByIdAndDelete(id);

            return { message: 'Video deleted successfully' };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to delete video: ${message}`);
        }
    }

    @Post('/:id/reprocess')
    async reprocessVideo(@Param('id') id: string): Promise<{ message: string }> {
        try {
            const video = await Video.findById(id);
            if (!video) {
                throw new Error('Video not found');
            }

            // Reset status and clear previous results
            video.transcriptionStatus = 'pending';
            video.questionGenerationStatus = 'pending';
            video.fullTranscript = undefined;
            video.segments = [];
            video.questions = [];
            video.transcriptionError = undefined;
            video.questionGenerationError = undefined;
            video.processedAt = undefined;

            await video.save();

            // Start background processing
            this.processVideoAsync(String(video._id));

            return { message: 'Video reprocessing started' };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to reprocess video: ${message}`);
        }
    }

    private async processVideoAsync(videoId: string): Promise<void> {
        try {
            const video = await Video.findById(videoId);
            if (!video) {
                console.error(`Video not found: ${videoId}`);
                return;
            }

            console.log(`Starting processing for video: ${video.originalName}`);

            // Step 1: Transcription
            video.transcriptionStatus = 'processing';
            await video.save();

            try {
                const transcriptionResult = await this.transcriptionService.transcribeVideo(video.filepath);
                
                video.fullTranscript = transcriptionResult.fullTranscript;
                video.segments = transcriptionResult.segments;
                video.transcriptionStatus = 'completed';
                await video.save();

                console.log(`Transcription completed for video: ${video.originalName}`);

            } catch (transcriptionError) {
                video.transcriptionStatus = 'failed';
                video.transcriptionError = transcriptionError instanceof Error ? transcriptionError.message : String(transcriptionError);
                await video.save();
                console.error(`Transcription failed for video ${video.originalName}:`, transcriptionError);
                return;
            }

            // Step 2: Question Generation
            video.questionGenerationStatus = 'processing';
            await video.save();

            try {
                const questions = await this.questionService.generateQuestions(video.segments);
                
                video.questions = questions;
                video.questionGenerationStatus = 'completed';
                video.processedAt = new Date();
                await video.save();

                console.log(`Question generation completed for video: ${video.originalName}`);

            } catch (questionError) {
                video.questionGenerationStatus = 'failed';
                video.questionGenerationError = questionError instanceof Error ? questionError.message : String(questionError);
                await video.save();
                console.error(`Question generation failed for video ${video.originalName}:`, questionError);
            }

        } catch (error) {
            console.error(`Processing failed for video ${videoId}:`, error);
        }
    }
}